import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compareEvalResults } from "./engine/comparator.js";
import { evalScenarioSchema, runDataset, type EvalRunResult, type EvalScenario } from "./engine/runner.js";
import { renderComparisonMarkdown } from "./reporters/markdownReporter.js";

function outputPath(): string | undefined {
  const index = process.argv.indexOf("--output-md");
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function main(): Promise<void> {
  const fixture = await readJson("evals/datasets/resolved-smoke.json");
  const scenarios = fixture && typeof fixture === "object" && Array.isArray((fixture as { scenarios?: unknown }).scenarios)
    ? (fixture as { scenarios: unknown[] }).scenarios
    : undefined;
  if (!scenarios) throw new Error("Resolved smoke fixture must contain a scenarios array.");

  const parsedScenarios: EvalScenario[] = scenarios.map((scenario, index) => {
    const parsed = evalScenarioSchema.safeParse(scenario);
    if (!parsed.success) throw new Error(`Invalid eval scenario at index ${index}.`);
    return parsed.data;
  });
  const baseline = await readJson("evals/baselines/word-puzzle-v1.result.json") as EvalRunResult;
  const comparison = compareEvalResults(baseline, runDataset(parsedScenarios));
  const markdown = renderComparisonMarkdown(comparison);

  if (outputPath()) await writeFile(resolve(outputPath()!), markdown, "utf8");
  console.log(comparison.summary);
  if (comparison.outcome === "regression") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`skill-eval CI: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
