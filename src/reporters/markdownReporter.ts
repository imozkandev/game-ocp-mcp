import type { EvalComparison, ScenarioComparison } from "../engine/comparator.js";
import type { EvalRunResult, ScenarioEvalResult } from "../engine/runner.js";

export interface PullRequestReportInput {
  current: EvalRunResult;
  baseline?: EvalRunResult;
  comparison?: EvalComparison;
  title?: string;
}

function escapeCell(value: string | number): string {
  return String(value).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function signed(value: number, suffix = ""): string {
  return `${value >= 0 ? "+" : ""}${value}${suffix}`;
}

function status(passed: boolean): string {
  return passed ? "✅ Pass" : "❌ Fail";
}

function scenarioRows(scenarios: ScenarioEvalResult[]): string[] {
  return scenarios.map((scenario) => [
    escapeCell(scenario.id),
    status(scenario.passed),
    `${scenario.score}%`,
    escapeCell(scenario.failedTests.join(", ") || "—"),
  ].join(" | "));
}

function comparisonRows(scenarios: ScenarioComparison[]): string[] {
  return scenarios.map((scenario) => [
    escapeCell(scenario.id),
    `${scenario.baselineScore}%`,
    `${scenario.candidateScore}%`,
    signed(scenario.delta, "%"),
    scenario.outcome === "improvement" ? "📈 Improvement" : scenario.outcome === "regression" ? "📉 Regression" : "➖ Unchanged",
  ].join(" | "));
}

/** Renders one eval run as a compact Markdown section for CI logs or PR comments. */
export function renderEvalMarkdown(result: EvalRunResult, title = "Skill evaluation"): string {
  const lines = [
    `## ${title}`,
    "",
    "| Metric | Result |",
    "| --- | ---: |",
    `| Score | **${result.score}%** |`,
    `| Passed scenarios | ${result.passedTests}/${result.totalTests} |`,
    `| Failed scenarios | ${result.failedTests}/${result.totalTests} |`,
    "",
    "### Scenario results",
    "",
    "| Scenario | Status | Score | Failed checks |",
    "| --- | --- | ---: | --- |",
    ...scenarioRows(result.scenarios).map((row) => `| ${row} |`),
  ];
  return `${lines.join("\n")}\n`;
}

/** Renders baseline/current metrics in a PR-comment-friendly comparison table. */
export function renderComparisonMarkdown(comparison: EvalComparison): string {
  const lines = [
    "## Skill eval regression report",
    "",
    "| Metric | v1 (Baseline) | v2 (Current) | Delta |",
    "| --- | ---: | ---: | ---: |",
    `| Score | ${comparison.baselineScore}% | ${comparison.candidateScore}% | ${signed(comparison.scoreDelta, "%")} |`,
    `| Pass Rate | ${comparison.baselinePassRate}% | ${comparison.candidatePassRate}% | ${signed(comparison.passRateDelta, "%")} |`,
    "",
    `**${comparison.outcome === "improvement" ? "📈 Improvement" : comparison.outcome === "regression" ? "📉 Regression" : "➖ No change"}:** ${comparison.summary}`,
    "",
    "### Scenario deltas",
    "",
    "| Scenario | v1 | v2 | Delta | Outcome |",
    "| --- | ---: | ---: | ---: | --- |",
    ...comparisonRows(comparison.scenarios).map((row) => `| ${row} |`),
  ];
  return `${lines.join("\n")}\n`;
}

/** Creates a complete Markdown PR comment from a current run and optional baseline comparison. */
export function renderPullRequestMarkdown(input: PullRequestReportInput): string {
  if (input.baseline && input.comparison) return renderComparisonMarkdown(input.comparison);
  return renderEvalMarkdown(input.current, input.title);
}
