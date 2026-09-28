import type { GuardrailViolation } from "../types.js";

// A method declaration cannot satisfy the required field-name + optional initializer + semicolon shape,
// so method calls inside a valid initializer (for example `new List<Foo>()`) remain supported.
const publicFieldPattern = /^\s*public\s+(?!class\b|struct\b|interface\b|enum\b|delegate\b)[A-Za-z_][A-Za-z0-9_.]*(?:\s*<[^;\n{}()]+>)?(?:\s*\[\s*\])?(?:\s*\?)?\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*=\s*[^;\n]+)?\s*;/gm;

function lineAt(source: string, characterIndex: number): number {
  return source.slice(0, characterIndex).split("\n").length;
}

function fileNameFromPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() || filePath;
}

/** Finds public Unity fields that can retain Inspector support without exposing mutable API surface. */
export function evaluatePublicFieldRule(source: string, filePath: string): GuardrailViolation[] {
  const fileName = fileNameFromPath(filePath);
  const violations: GuardrailViolation[] = [];

  for (const match of source.matchAll(publicFieldPattern)) {
    const declaration = match[0].trim();
    if (/\b(?:const|static)\b/.test(declaration)) continue;
    violations.push({
      fileName,
      filePath,
      line: lineAt(source, match.index ?? 0),
      ruleName: "public-field-serialization",
      severity: "warning",
      message: `Public field declaration detected: ${declaration}`,
      recommendation: "Preserve Inspector assignment while reducing public API surface: replace it with [SerializeField] private <type> <fieldName>;.",
    });
  }
  return violations;
}
