import type { GuardrailViolation, LifecycleBlock, RuleName } from "../types.js";

interface RuntimeRule {
  name: RuleName;
  pattern: RegExp;
  message: (match: string, lifecycle: LifecycleBlock["method"]) => string;
  recommendation: string;
}

const runtimeRules: RuntimeRule[] = [
  {
    name: "gc-string-concatenation-in-frame-loop",
    pattern: /(?:"(?:\\.|[^"\\])*"\s*\+|\+\s*"(?:\\.|[^"\\])*")/g,
    message: (_match, lifecycle) => `String concatenation allocates garbage inside ${lifecycle}().`,
    recommendation: "Use a cached StringBuilder, preformatted strings, or update text only when its value changes.",
  },
  {
    name: "gc-linq-in-frame-loop",
    pattern: /\b(?:Enumerable\s*\.\s*)?(?:Where|Select|SelectMany|OrderBy|OrderByDescending|GroupBy|ToList|ToArray|Distinct|Aggregate|Any|All|First|FirstOrDefault|Single|SingleOrDefault|Count|Skip|Take)\s*(?:<[^>(){};]+>)?\s*\(/g,
    message: (match, lifecycle) => `LINQ call ${match.replace(/\s+/g, " ").trim()} allocates or iterates inside ${lifecycle}().`,
    recommendation: "Replace LINQ with a reusable loop and cache its result outside the per-frame method.",
  },
  {
    name: "gc-allocation-in-frame-loop",
    pattern: /\bnew\s+[A-Za-z_][A-Za-z0-9_.]*(?:\s*<[^;(){}]+>)?/g,
    message: (match, lifecycle) => `${match.trim()} creates an allocation inside ${lifecycle}().`,
    recommendation: "Cache reusable objects, use object pooling, or move the allocation outside the per-frame method.",
  },
  {
    name: "component-lookup-in-frame-loop",
    pattern: /\b(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)?GetComponent(?:InChildren|InParent)?\s*(?:<[^>(){};]+>)?\s*\(/g,
    message: (match, lifecycle) => `${match.replace(/\s+/g, " ").trim()} performs a component lookup inside ${lifecycle}().`,
    recommendation: "Cache the component reference in Awake() or Start() and reuse that field in the frame loop.",
  },
  {
    name: "scene-search-in-frame-loop",
    pattern: /\b(?:(?:GameObject|Object|Resources)\s*\.\s*)?Find(?:ObjectOfType|ObjectsOfType|AnyObjectByType|FirstObjectByType|GameObjectWithTag|GameObjectsWithTag)?\s*(?:<[^>(){};]+>)?\s*\(/g,
    message: (match, lifecycle) => `${match.replace(/\s+/g, " ").trim()} searches the scene inside ${lifecycle}().`,
    recommendation: "Resolve scene references once during initialization, inject them, or maintain a registry instead of searching every frame.",
  },
];

function lineAt(source: string, characterIndex: number): number {
  return source.slice(0, characterIndex).split("\n").length;
}

function fileNameFromPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() || filePath;
}

/** Applies allocation and lookup rules only within Update/LateUpdate/FixedUpdate bodies. */
export function evaluateRuntimeRules(source: string, filePath: string, blocks: LifecycleBlock[]): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const fileName = fileNameFromPath(filePath);

  for (const lifecycle of blocks) {
    const body = source.slice(lifecycle.bodyStart, lifecycle.bodyEnd);
    for (const rule of runtimeRules) {
      rule.pattern.lastIndex = 0;
      for (const match of body.matchAll(rule.pattern)) {
        const index = lifecycle.bodyStart + (match.index ?? 0);
        violations.push({
          fileName,
          filePath,
          line: lineAt(source, index),
          ruleName: rule.name,
          severity: "warning",
          lifecycleMethod: lifecycle.method,
          message: rule.message(match[0], lifecycle.method),
          recommendation: rule.recommendation,
        });
      }
    }
  }
  return violations;
}
