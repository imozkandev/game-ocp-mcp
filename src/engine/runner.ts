import { z } from "zod";
import { containsKeywords, isValidJson, matchesSchema, withinLength } from "./assertions.js";

export const evalCriteriaSchema = z.object({
  validJson: z.boolean().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  requiredKeywords: z.array(z.string()).default([]),
  forbiddenKeywords: z.array(z.string()).default([]),
});

export const evalScenarioSchema = z.object({
  id: z.string().trim().min(1),
  input: z.string(),
  output: z.string(),
  criteria: evalCriteriaSchema,
});

export type EvalCriteria = z.infer<typeof evalCriteriaSchema> & {
  /** Runtime-only Zod schema. Keep it out of JSON dataset files. */
  schema?: z.ZodSchema;
};

export type EvalScenario = Omit<z.infer<typeof evalScenarioSchema>, "criteria"> & {
  criteria: EvalCriteria;
};

export interface EvalCheckResult {
  name: "valid-json" | "schema" | "length" | "keywords";
  passed: boolean;
  message: string;
}

export interface ScenarioEvalResult {
  id: string;
  input: string;
  score: number;
  passed: boolean;
  passedTests: string[];
  failedTests: string[];
  errors: string[];
  checks: EvalCheckResult[];
}

export interface EvalRunResult {
  score: number;
  passedTests: number;
  failedTests: number;
  totalTests: number;
  scenarios: ScenarioEvalResult[];
}

function characterLength(text: string): number {
  return Array.from(text).length;
}

function parseJsonObject(output: string): object | undefined {
  try {
    const value: unknown = JSON.parse(output);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function schemaFailureMessage(output: string, schema: z.ZodSchema): string {
  const parsed = parseJsonObject(output);
  if (!parsed) return "Schema validation requires output to be a valid JSON object.";
  const result = schema.safeParse(parsed);
  if (result.success) return "Output matches the expected schema.";
  return result.error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ");
}

/** Runs one deterministic scenario without calling a model or external API. */
export function runScenario(scenario: EvalScenario): ScenarioEvalResult {
  const checks: EvalCheckResult[] = [];
  const criteria = scenario.criteria;

  if (criteria.validJson !== undefined) {
    const valid = isValidJson(scenario.output);
    const passed = criteria.validJson ? valid : !valid;
    checks.push({
      name: "valid-json",
      passed,
      message: passed
        ? `JSON validity matched the expected value (${criteria.validJson}).`
        : `Expected validJson=${criteria.validJson}, received ${valid}.`,
    });
  }

  if (criteria.schema) {
    const objectOutput = parseJsonObject(scenario.output);
    const passed = objectOutput !== undefined && matchesSchema(objectOutput, criteria.schema);
    checks.push({ name: "schema", passed, message: passed ? "Output matches the expected schema." : schemaFailureMessage(scenario.output, criteria.schema) });
  }

  if (criteria.minLength !== undefined || criteria.maxLength !== undefined) {
    const min = criteria.minLength ?? 0;
    const max = criteria.maxLength ?? Number.MAX_SAFE_INTEGER;
    const rangeLabel = `[${min}, ${criteria.maxLength ?? "∞"}]`;
    const passed = withinLength(scenario.output, min, max);
    checks.push({
      name: "length",
      passed,
      message: passed
        ? `Length ${characterLength(scenario.output)} is within ${rangeLabel}.`
        : `Length ${characterLength(scenario.output)} is outside ${rangeLabel}.`,
    });
  }

  const required = criteria.requiredKeywords ?? [];
  const forbidden = criteria.forbiddenKeywords ?? [];
  if (required.length > 0 || forbidden.length > 0) {
    const passed = containsKeywords(scenario.output, required, forbidden);
    const missing = required.filter((keyword) => !scenario.output.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
    const presentForbidden = forbidden.filter((keyword) => scenario.output.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
    checks.push({
      name: "keywords",
      passed,
      message: passed
        ? "Required and forbidden keyword checks passed."
        : [missing.length ? `Missing required: ${missing.join(", ")}.` : "", presentForbidden.length ? `Forbidden present: ${presentForbidden.join(", ")}.` : ""].filter(Boolean).join(" "),
    });
  }

  if (checks.length === 0) {
    checks.push({ name: "length", passed: false, message: "Scenario has no configured evaluation criteria." });
  }

  const passedTests = checks.filter((check) => check.passed).map((check) => check.name);
  const failedChecks = checks.filter((check) => !check.passed);
  return {
    id: scenario.id,
    input: scenario.input,
    score: Math.round((passedTests.length / checks.length) * 100),
    passed: failedChecks.length === 0,
    passedTests,
    failedTests: failedChecks.map((check) => check.name),
    errors: failedChecks.map((check) => check.message),
    checks,
  };
}

/** Runs dataset scenarios sequentially and aggregates score, pass/fail, and error details. */
export function runDataset(scenarios: EvalScenario[]): EvalRunResult {
  const scenarioResults = scenarios.map((scenario) => runScenario(scenario));
  const totalTests = scenarioResults.length;
  const passedTests = scenarioResults.filter((result) => result.passed).length;
  return {
    score: totalTests === 0 ? 0 : Math.round(scenarioResults.reduce((total, result) => total + result.score, 0) / totalTests),
    passedTests,
    failedTests: totalTests - passedTests,
    totalTests,
    scenarios: scenarioResults,
  };
}

/** Alias retained for callers that prefer an explicit eval-oriented name. */
export const runEvalDataset = runDataset;
