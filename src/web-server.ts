import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lintLevelBalance } from "./tools/balanceLinter.js";
import { auditLocalization } from "./tools/locAuditor.js";
import { runAgentEvals } from "./tools/evalRunner.js";
import { scanUnityPath } from "./engine/fileScanner.js";
import { scanAgentLogs } from "./scanner/logScanner.js";
import { scanAgentProcesses } from "./scanner/processScanner.js";
import { compareEvalResults } from "./engine/comparator.js";
import { evalScenarioSchema, runDataset, type EvalRunResult, type EvalScenario } from "./engine/runner.js";
import { renderComparisonMarkdown } from "./reporters/markdownReporter.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = join(sourceDirectory, "..", "web");
const projectDirectory = join(sourceDirectory, "..");
const maxRequestSize = 1_000_000;

const staticAssets: Record<string, { file: string; contentType: string }> = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "application/javascript; charset=utf-8" },
};

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

async function parseBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxRequestSize) throw new Error("Request body exceeds 1 MB.");
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function loadJsonFixture(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error: unknown) {
    throw new Error(`Could not read skill-eval fixture: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runSkillEvalDemo(): Promise<{ ok: boolean; baseline: EvalRunResult; candidate: EvalRunResult; comparison: ReturnType<typeof compareEvalResults>; markdown: string }> {
  const dataset = await loadJsonFixture(join(projectDirectory, "evals", "datasets", "resolved-smoke.json"));
  const scenarios = dataset && typeof dataset === "object" && Array.isArray((dataset as { scenarios?: unknown }).scenarios)
    ? (dataset as { scenarios: unknown[] }).scenarios
    : undefined;
  if (!scenarios) throw new Error("Skill-eval dataset must contain a scenarios array.");

  const parsedScenarios: EvalScenario[] = scenarios.map((scenario, index) => {
    const parsed = evalScenarioSchema.safeParse(scenario);
    if (!parsed.success) throw new Error(`Invalid skill-eval scenario at index ${index}.`);
    return parsed.data;
  });
  const baseline = await loadJsonFixture(join(projectDirectory, "evals", "baselines", "word-puzzle-v1.result.json")) as EvalRunResult;
  const candidate = runDataset(parsedScenarios);
  const comparison = compareEvalResults(baseline, candidate);
  return { ok: comparison.outcome !== "regression", baseline, candidate, comparison, markdown: renderComparisonMarkdown(comparison) };
}

async function handleApi(pathname: string, request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (request.method !== "POST") return false;

  const body = await parseBody(request);
  switch (pathname) {
    case "/api/lint":
      sendJson(response, 200, await lintLevelBalance(body));
      return true;
    case "/api/localization":
      sendJson(response, 200, await auditLocalization(body));
      return true;
    case "/api/evals":
      sendJson(response, 200, runAgentEvals(body));
      return true;
    case "/api/skill-eval":
      sendJson(response, 200, await runSkillEvalDemo());
      return true;
    case "/api/unity-guard": {
      const path = body && typeof body === "object" ? (body as { path?: unknown }).path : undefined;
      if (typeof path !== "string" || path.trim().length === 0) {
        sendJson(response, 400, { error: "A C# file or directory path is required." });
        return true;
      }
      const scan = await scanUnityPath(path);
      sendJson(response, 200, { ok: scan.totalViolations === 0, ...scan });
      return true;
    }
    case "/api/agent-mon/list": {
      const scan = await scanAgentProcesses();
      sendJson(response, 200, {
        ok: !scan.warnings.some((warning) => warning.startsWith("Process discovery failed")),
        ...scan,
      });
      return true;
    }
    case "/api/agent-mon/audit": {
      const logPath = body && typeof body === "object" ? (body as { logPath?: unknown }).logPath : undefined;
      if (typeof logPath !== "string" || logPath.trim().length === 0) {
        sendJson(response, 400, { error: "A log file or directory path is required." });
        return true;
      }
      const audit = await scanAgentLogs(logPath);
      sendJson(response, 200, {
        ok: !audit.warnings.some((warning) => warning.startsWith("Log discovery failed")),
        ...audit,
      });
      return true;
    }
    default:
      return false;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  try {
    if (await handleApi(url.pathname, request, response)) return;

    const asset = request.method === "GET" ? staticAssets[url.pathname] : undefined;
    if (!asset) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }

    const content = await readFile(join(webDirectory, asset.file));
    response.writeHead(200, { "content-type": asset.contentType, "cache-control": "no-cache" });
    response.end(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const statusCode = message.includes("valid JSON") || message.includes("1 MB") ? 400 : 500;
    sendJson(response, statusCode, { error: message });
  }
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
server.listen(port, "127.0.0.1", () => {
  console.log(`Game Ops Studio is running at http://127.0.0.1:${port}`);
});
