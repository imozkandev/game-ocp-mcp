import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lintLevelBalance } from "./tools/balanceLinter.js";
import { auditLocalization } from "./tools/locAuditor.js";
import { runAgentEvals } from "./tools/evalRunner.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const examplesDirectory = join(sourceDirectory, "..", "examples");

function printResult(name: string, result: unknown): void {
  console.log(`\n${name}`);
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const balanceResult = await lintLevelBalance({
    filePath: join(examplesDirectory, "levels.json"),
  });
  printResult("lint_level_balance", balanceResult);
  assert.ok(
    balanceResult.warnings.some((issue) => issue.code === "MOVE_SPIKE"),
    "Expected the mock levels to contain a move spike warning.",
  );
  assert.ok(
    balanceResult.warnings.some((issue) => issue.code === "ZERO_REWARD"),
    "Expected the mock levels to contain a zero-reward warning.",
  );

  const localizationResult = await auditLocalization({
    locDirPath: join(examplesDirectory, "locales"),
  });
  printResult("audit_localization", localizationResult);
  assert.ok(
    localizationResult.errors.some((issue) => issue.file === "tr.json" && issue.code === "MISSING_KEY"),
    "Expected tr.json to be missing a key.",
  );
  assert.ok(
    localizationResult.errors.some((issue) => issue.file === "tr.json" && issue.code === "PLACEHOLDER_MISMATCH"),
    "Expected tr.json to have an invalid placeholder.",
  );

  const wordPuzzleResult = runAgentEvals({
    taskType: "word_puzzle",
    generatedOutput: {
      grid: ["CAT", "DOG", "SUN"],
      words: [
        { word: "CAT", row: 0, column: 0, direction: "horizontal" },
        { word: "DOG", row: 1, column: 0, direction: "horizontal" },
      ],
    },
  });
  printResult("run_agent_evals (word_puzzle)", wordPuzzleResult);
  assert.equal(wordPuzzleResult.score, 100, "Expected the word puzzle eval to pass.");

  const notificationResult = runAgentEvals({
    taskType: "push_notification",
    generatedOutput: {
      title: "New quest unlocked!",
      body: "Play now to claim your reward.",
      cta: "Play now",
    },
  });
  printResult("run_agent_evals (push_notification)", notificationResult);
  assert.equal(notificationResult.score, 100, "Expected the push notification eval to pass.");

  console.log("\nAll direct tool checks completed successfully.");
}

main().catch((error: unknown) => {
  console.error("Direct tool checks failed:", error);
  process.exitCode = 1;
});
