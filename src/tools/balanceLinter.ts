import { readFile } from "node:fs/promises";
import { z } from "zod";

/** The input accepted by the lint_level_balance MCP tool. */
export const balanceLinterInputSchema = z.object({
  filePath: z.string().trim().min(1, "filePath is required"),
});

/** A single level definition used by the balance linter. */
export const levelSchema = z.object({
  levelId: z.union([z.string().trim().min(1), z.number().int().nonnegative()]),
  targetScore: z.number().finite().nonnegative(),
  maxMoves: z.number().int(),
  rewardCoins: z.number().finite().nonnegative(),
});

export type Level = z.infer<typeof levelSchema>;

export interface BalanceLintIssue {
  severity: "error" | "warning";
  code:
    | "FILE_NOT_FOUND"
    | "FILE_READ_FAILED"
    | "INVALID_JSON"
    | "INVALID_LEVEL_LIST"
    | "INVALID_LEVEL"
    | "ZERO_REWARD"
    | "IMPOSSIBLE_MOVE_LIMIT"
    | "MOVE_SPIKE";
  message: string;
  levelId?: Level["levelId"];
  index?: number;
}

export interface BalanceLintResult {
  ok: boolean;
  levelsChecked: number;
  errors: BalanceLintIssue[];
  warnings: BalanceLintIssue[];
}

function addIssue(result: BalanceLintResult, issue: BalanceLintIssue): void {
  (issue.severity === "error" ? result.errors : result.warnings).push(issue);
}

function zodMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "value"}: ${issue.message}`)
    .join("; ");
}

function extractLevels(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { levels?: unknown }).levels)) {
    return (value as { levels: unknown[] }).levels;
  }
  return undefined;
}

/**
 * Validates a level-balance JSON document and reports deterministic balance anomalies.
 * Both a top-level level array and `{ levels: [...] }` documents are accepted.
 */
export async function lintLevelBalance(input: unknown): Promise<BalanceLintResult> {
  const result: BalanceLintResult = { ok: false, levelsChecked: 0, errors: [], warnings: [] };
  const parsedInput = balanceLinterInputSchema.safeParse(input);

  if (!parsedInput.success) {
    addIssue(result, {
      severity: "error",
      code: "FILE_READ_FAILED",
      message: `Invalid tool input: ${zodMessage(parsedInput.error)}`,
    });
    return result;
  }

  let raw: string;
  try {
    raw = await readFile(parsedInput.data.filePath, "utf8");
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    addIssue(result, {
      severity: "error",
      code: nodeError.code === "ENOENT" ? "FILE_NOT_FOUND" : "FILE_READ_FAILED",
      message:
        nodeError.code === "ENOENT"
          ? `Level file not found: ${parsedInput.data.filePath}`
          : `Could not read level file: ${nodeError.message ?? parsedInput.data.filePath}`,
    });
    return result;
  }

  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error: unknown) {
    addIssue(result, {
      severity: "error",
      code: "INVALID_JSON",
      message: `Level file contains invalid JSON: ${(error as Error).message}`,
    });
    return result;
  }

  const levels = extractLevels(document);
  if (!levels) {
    addIssue(result, {
      severity: "error",
      code: "INVALID_LEVEL_LIST",
      message: "Expected a level array or an object with a levels array.",
    });
    return result;
  }

  let previousLevel: Level | undefined;
  for (const [index, candidate] of levels.entries()) {
    const parsedLevel = levelSchema.safeParse(candidate);
    if (!parsedLevel.success) {
      addIssue(result, {
        severity: "error",
        code: "INVALID_LEVEL",
        index,
        message: `Invalid level at index ${index}: ${zodMessage(parsedLevel.error)}`,
      });
      continue;
    }

    const level = parsedLevel.data;
    result.levelsChecked += 1;

    if (level.rewardCoins === 0) {
      addIssue(result, {
        severity: "warning",
        code: "ZERO_REWARD",
        levelId: level.levelId,
        index,
        message: `Level ${level.levelId} has a zero coin reward.`,
      });
    }

    if (level.maxMoves <= 0) {
      addIssue(result, {
        severity: "error",
        code: "IMPOSSIBLE_MOVE_LIMIT",
        levelId: level.levelId,
        index,
        message: `Level ${level.levelId} must allow at least one move (received ${level.maxMoves}).`,
      });
    }

    if (previousLevel) {
      const moveDifference = Math.abs(level.maxMoves - previousLevel.maxMoves);
      // A 50% change (with a five-move minimum) catches large adjacent tuning jumps
      // without flagging ordinary one- or two-move progression adjustments.
      const spikeThreshold = Math.max(5, Math.ceil(Math.abs(previousLevel.maxMoves) * 0.5));
      if (moveDifference > spikeThreshold) {
        addIssue(result, {
          severity: "warning",
          code: "MOVE_SPIKE",
          levelId: level.levelId,
          index,
          message: `Level ${level.levelId} changes maxMoves by ${moveDifference} from level ${previousLevel.levelId} (threshold: ${spikeThreshold}).`,
        });
      }
    }

    previousLevel = level;
  }

  result.ok = result.errors.length === 0;
  return result;
}
