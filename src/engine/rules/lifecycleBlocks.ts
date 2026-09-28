import type { LifecycleBlock, LifecycleMethod } from "../types.js";

const lifecycleMethodPattern = /\b(?:public|private|protected|internal|static|virtual|override|sealed|async|new|extern|unsafe|partial|\s)*(?:void|IEnumerator|Task(?:<[^>]+>)?)\s+(Update|LateUpdate|FixedUpdate)\s*\([^)]*\)\s*\{/g;

function findClosingBrace(source: string, openingBraceIndex: number): number | undefined {
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let stringQuote: '"' | "'" | undefined;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (current === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (stringQuote) {
      if (current === "\\") {
        index += 1;
      } else if (current === stringQuote) {
        stringQuote = undefined;
      }
      continue;
    }
    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (current === '"' || current === "'") {
      stringQuote = current;
      continue;
    }
    if (current === "{") depth += 1;
    if (current === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

/** Finds the executable body ranges of Unity's per-frame lifecycle methods. */
export function findLifecycleBlocks(source: string): LifecycleBlock[] {
  const blocks: LifecycleBlock[] = [];
  for (const match of source.matchAll(lifecycleMethodPattern)) {
    const openingBraceIndex = (match.index ?? 0) + match[0].lastIndexOf("{");
    const bodyEnd = findClosingBrace(source, openingBraceIndex);
    if (bodyEnd === undefined) continue;
    blocks.push({
      method: match[1] as LifecycleMethod,
      bodyStart: openingBraceIndex + 1,
      bodyEnd,
    });
  }
  return blocks;
}
