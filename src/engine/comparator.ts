import type { EvalRunResult, ScenarioEvalResult } from "./runner.js";

export type ComparisonOutcome = "improvement" | "regression" | "unchanged";

export interface ScenarioComparison {
  id: string;
  baselineScore: number;
  candidateScore: number;
  delta: number;
  outcome: ComparisonOutcome;
  baselinePassed: boolean;
  candidatePassed: boolean;
}

export interface EvalComparison {
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  baselinePassRate: number;
  candidatePassRate: number;
  passRateDelta: number;
  outcome: ComparisonOutcome;
  summary: string;
  scenarios: ScenarioComparison[];
}

function outcomeFor(delta: number): ComparisonOutcome {
  if (delta > 0) return "improvement";
  if (delta < 0) return "regression";
  return "unchanged";
}

function passRate(result: EvalRunResult): number {
  return result.totalTests === 0 ? 0 : Math.round((result.passedTests / result.totalTests) * 100);
}

function scenarioMap(scenarios: ScenarioEvalResult[]): Map<string, ScenarioEvalResult> {
  return new Map(scenarios.map((scenario) => [scenario.id, scenario]));
}

/**
 * Compares baseline and candidate deterministic eval results. Missing scenarios
 * are represented as a zero-score failure so coverage reductions are visible.
 */
export function compareEvalResults(baseline: EvalRunResult, candidate: EvalRunResult): EvalComparison {
  const baselineById = scenarioMap(baseline.scenarios);
  const candidateById = scenarioMap(candidate.scenarios);
  const ids = [...new Set([...baselineById.keys(), ...candidateById.keys()])].sort();
  const scenarios = ids.map((id) => {
    const baselineScenario = baselineById.get(id);
    const candidateScenario = candidateById.get(id);
    const baselineScore = baselineScenario?.score ?? 0;
    const candidateScore = candidateScenario?.score ?? 0;
    const delta = candidateScore - baselineScore;
    return {
      id,
      baselineScore,
      candidateScore,
      delta,
      outcome: outcomeFor(delta),
      baselinePassed: baselineScenario?.passed ?? false,
      candidatePassed: candidateScenario?.passed ?? false,
    };
  });

  const baselinePassRate = passRate(baseline);
  const candidatePassRate = passRate(candidate);
  const scoreDelta = candidate.score - baseline.score;
  const passRateDelta = candidatePassRate - baselinePassRate;
  const outcome = outcomeFor(scoreDelta);
  const signedPassRateDelta = `${passRateDelta >= 0 ? "+" : ""}${passRateDelta}`;

  return {
    baselineScore: baseline.score,
    candidateScore: candidate.score,
    scoreDelta,
    baselinePassRate,
    candidatePassRate,
    passRateDelta,
    outcome,
    summary: `Pass Rate: ${baselinePassRate}% -> ${candidatePassRate}% (${signedPassRateDelta}%, ${outcome}).`,
    scenarios,
  };
}
