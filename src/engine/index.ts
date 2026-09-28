import { findLifecycleBlocks } from "./rules/lifecycleBlocks.js";
import { evaluatePublicFieldRule } from "./rules/publicFields.js";
import { evaluateRuntimeRules } from "./rules/runtimeRules.js";
import type { GuardrailReport, GuardrailViolation, RuleName } from "./types.js";

function fileNameFromPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() || filePath;
}

/**
 * Analyses one Unity C# source file and returns machine-readable guardrail findings.
 * The engine never changes source files; callers can render the recommendations in a CLI or agent workflow.
 */
export function analyzeUnitySource(source: string, filePath: string): GuardrailReport {
  const lifecycleBlocks = findLifecycleBlocks(source);
  const violations: GuardrailViolation[] = [
    ...evaluateRuntimeRules(source, filePath, lifecycleBlocks),
    ...evaluatePublicFieldRule(source, filePath),
  ].sort((left, right) => left.line - right.line || left.ruleName.localeCompare(right.ruleName));

  const byRule: Partial<Record<RuleName, number>> = {};
  for (const violation of violations) {
    byRule[violation.ruleName] = (byRule[violation.ruleName] ?? 0) + 1;
  }

  return {
    fileName: fileNameFromPath(filePath),
    filePath,
    violations,
    summary: { total: violations.length, byRule },
  };
}

export type { GuardrailReport, GuardrailViolation, LifecycleMethod, RuleName } from "./types.js";
