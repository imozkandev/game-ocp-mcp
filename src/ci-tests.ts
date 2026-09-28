import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lintLevelBalance } from "./tools/balanceLinter.js";
import { auditLocalization } from "./tools/locAuditor.js";
import { scanUnityPath } from "./engine/fileScanner.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const examplesDirectory = join(sourceDirectory, "..", "examples");

async function testBalance(): Promise<void> {
  const result = await lintLevelBalance({ filePath: join(examplesDirectory, "levels.json") });
  assert.ok(result.warnings.some((issue) => issue.code === "MOVE_SPIKE"), "Expected a move-spike warning.");
  assert.ok(result.warnings.some((issue) => issue.code === "ZERO_REWARD"), "Expected a zero-reward warning.");
  console.log(`Balance linter: passed (${result.levelsChecked} levels checked).`);
}

async function testLocalization(): Promise<void> {
  const result = await auditLocalization({ locDirPath: join(examplesDirectory, "locales") });
  assert.ok(result.errors.some((issue) => issue.file === "tr.json" && issue.code === "MISSING_KEY"), "Expected tr.json to be missing a key.");
  assert.ok(result.errors.some((issue) => issue.file === "tr.json" && issue.code === "PLACEHOLDER_MISMATCH"), "Expected tr.json to contain a placeholder mismatch.");
  console.log(`Localization audit: passed (${result.filesChecked} locale files checked).`);
}

async function testUnityGuard(): Promise<void> {
  const bad = await scanUnityPath(join(examplesDirectory, "BadPlayerController.cs"));
  const clean = await scanUnityPath(join(examplesDirectory, "CleanPlayerController.cs"));
  assert.ok(bad.totalViolations > 0, "Expected the bad Unity controller to trigger guardrails.");
  assert.ok(bad.violations.some((violation) => violation.ruleName === "component-lookup-in-frame-loop"), "Expected a frame-loop component lookup violation.");
  assert.equal(clean.totalViolations, 0, "Expected the clean Unity controller to pass guardrails.");
  console.log(`Unity Guard: passed (bad sample: ${bad.totalViolations} findings; clean sample: 0 findings).`);
}

const target = process.argv[2];
const tests: Record<string, () => Promise<void>> = {
  balance: testBalance,
  loc: testLocalization,
  "unity-guard": testUnityGuard,
};

if (!target || !tests[target]) {
  console.error("Usage: tsx src/ci-tests.ts <balance|loc|unity-guard>");
  process.exitCode = 1;
} else {
  tests[target]().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
