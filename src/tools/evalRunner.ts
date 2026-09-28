import assert from "node:assert/strict";
import { z } from "zod";

export const agentEvalInputSchema = z.object({
  taskType: z.enum(["word_puzzle", "push_notification"]),
  generatedOutput: z.record(z.string(), z.unknown()),
});

export interface EvalScenarioResult {
  name: string;
  passed: boolean;
  failureReason?: string;
}

export interface AgentEvalResult {
  ok: boolean;
  taskType: "word_puzzle" | "push_notification" | "unknown";
  score: number;
  scenarios: EvalScenarioResult[];
  failures: string[];
}

const wordPlacementSchema = z.object({
  word: z.string().trim().min(1),
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  direction: z.enum(["horizontal", "vertical"]),
});

const wordPuzzleSchema = z.object({
  grid: z.array(z.union([z.string().min(1), z.array(z.string().length(1)).min(1)])).min(1),
  words: z.array(wordPlacementSchema).min(1),
});

const pushNotificationSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  cta: z.string().trim().min(1).optional(),
});

function failureMessage(error: unknown): string {
  if (error instanceof assert.AssertionError) return error.message;
  if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ");
  return error instanceof Error ? error.message : "Unknown evaluation failure.";
}

function runAssertion(scenarios: EvalScenarioResult[], name: string, assertion: () => void): void {
  try {
    assertion();
    scenarios.push({ name, passed: true });
  } catch (error: unknown) {
    scenarios.push({ name, passed: false, failureReason: failureMessage(error) });
  }
}

function gridRows(grid: z.infer<typeof wordPuzzleSchema>["grid"]): string[][] {
  return grid.map((row) => (typeof row === "string" ? Array.from(row) : row));
}

function evaluateWordPuzzle(output: Record<string, unknown>): EvalScenarioResult[] {
  const scenarios: EvalScenarioResult[] = [];
  const parsed = wordPuzzleSchema.safeParse(output);
  runAssertion(scenarios, "schema_integrity", () => assert.ok(parsed.success, parsed.success ? undefined : failureMessage(parsed.error)));
  if (!parsed.success) return scenarios;

  const rows = gridRows(parsed.data.grid);
  runAssertion(scenarios, "rectangular_grid", () => {
    const width = rows[0]?.length ?? 0;
    assert.ok(width > 0, "Grid must have at least one column.");
    assert.ok(rows.every((row) => row.length === width), "Every grid row must have the same width.");
  });
  runAssertion(scenarios, "word_within_grid_bounds", () => {
    const height = rows.length;
    const width = rows[0]?.length ?? 0;
    for (const placement of parsed.data.words) {
      const length = Array.from(placement.word).length;
      const endRow = placement.row + (placement.direction === "vertical" ? length - 1 : 0);
      const endColumn = placement.column + (placement.direction === "horizontal" ? length - 1 : 0);
      assert.ok(endRow < height && endColumn < width, `"${placement.word}" exceeds the grid at (${placement.row}, ${placement.column}).`);
    }
  });
  runAssertion(scenarios, "no_duplicate_words", () => {
    const normalized = parsed.data.words.map((placement) => placement.word.trim().toLocaleLowerCase("en-US"));
    assert.equal(new Set(normalized).size, normalized.length, "Word list contains duplicates.");
  });
  return scenarios;
}

function evaluatePushNotification(output: Record<string, unknown>): EvalScenarioResult[] {
  const scenarios: EvalScenarioResult[] = [];
  const parsed = pushNotificationSchema.safeParse(output);
  runAssertion(scenarios, "schema_integrity", () => assert.ok(parsed.success, parsed.success ? undefined : failureMessage(parsed.error)));
  if (!parsed.success) return scenarios;

  runAssertion(scenarios, "title_length", () => assert.ok(Array.from(parsed.data.title).length <= 45, "Title must be 45 characters or fewer."));
  runAssertion(scenarios, "body_length", () => assert.ok(Array.from(parsed.data.body).length <= 120, "Body must be 120 characters or fewer."));
  runAssertion(scenarios, "call_to_action", () => {
    const content = [parsed.data.title, parsed.data.body, parsed.data.cta ?? ""].join(" ");
    const ctaPattern = /\b(play|start|try|join|claim|get|discover|unlock|download|shop|open|tap|now|today)\b/i;
    assert.ok(ctaPattern.test(content) || Boolean(parsed.data.cta), "Notification needs a clear call to action.");
  });
  return scenarios;
}

/** Runs deterministic, assertion-based checks over agent-created game content. */
export function runAgentEvals(input: unknown): AgentEvalResult {
  const parsedInput = agentEvalInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const reason = failureMessage(parsedInput.error);
    return {
      ok: false,
      taskType: "unknown",
      score: 0,
      scenarios: [{ name: "input_validation", passed: false, failureReason: reason }],
      failures: [reason],
    };
  }

  const scenarios = parsedInput.data.taskType === "word_puzzle"
    ? evaluateWordPuzzle(parsedInput.data.generatedOutput)
    : evaluatePushNotification(parsedInput.data.generatedOutput);
  const failures = scenarios.flatMap((scenario) => (scenario.passed ? [] : [scenario.failureReason ?? scenario.name]));
  const score = scenarios.length === 0 ? 0 : Math.round((100 * (scenarios.length - failures.length)) / scenarios.length);

  return { ok: failures.length === 0, taskType: parsedInput.data.taskType, score, scenarios, failures };
}
