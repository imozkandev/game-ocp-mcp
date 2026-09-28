import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { glob } from "glob";

export type FailurePatternName = "rate-limit" | "context-window-exceeded" | "connection-refused";

export interface FailureOccurrence {
  filePath: string;
  line: number;
  text: string;
}

export interface FailurePatternSummary {
  name: FailurePatternName;
  count: number;
  occurrences: FailureOccurrence[];
}

export interface LogScanResult {
  targetPath: string;
  filesScanned: number;
  totalMatches: number;
  patterns: FailurePatternSummary[];
  warnings: string[];
}

export interface LogScannerOptions {
  maxFileSizeBytes?: number;
  maxOccurrencesPerPattern?: number;
}

const defaultMaxFileSizeBytes = 10 * 1_024 * 1_024;
const defaultMaxOccurrencesPerPattern = 100;
const failurePatterns: Array<{ name: FailurePatternName; expression: RegExp }> = [
  { name: "rate-limit", expression: /rate\s*limit(?:error)?/gi },
  { name: "context-window-exceeded", expression: /contextwindowexceeded/gi },
  { name: "connection-refused", expression: /econnrefused|connection refused/gi },
];

async function findLogFiles(targetPath: string): Promise<string[]> {
  const absoluteTarget = resolve(targetPath);
  const targetStat = await stat(absoluteTarget);
  if (targetStat.isFile()) return [absoluteTarget];
  if (!targetStat.isDirectory()) throw new Error(`Expected a log file or directory: ${targetPath}`);

  return glob("**/*", {
    cwd: absoluteTarget,
    absolute: true,
    nodir: true,
    dot: false,
    ignore: ["**/.git/**", "**/node_modules/**", "**/Library/**", "**/Temp/**"],
  });
}

/** Scans a log file or tree for agent failure patterns without failing on unreadable files. */
export async function scanAgentLogs(targetPath: string, options: LogScannerOptions = {}): Promise<LogScanResult> {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? defaultMaxFileSizeBytes;
  const maxOccurrences = options.maxOccurrencesPerPattern ?? defaultMaxOccurrencesPerPattern;
  const summaries = failurePatterns.map(({ name }) => ({ name, count: 0, occurrences: [] as FailureOccurrence[] }));
  const warnings: string[] = [];
  let files: string[];

  try {
    files = (await findLogFiles(targetPath)).sort();
  } catch (error: unknown) {
    return {
      targetPath: resolve(targetPath),
      filesScanned: 0,
      totalMatches: 0,
      patterns: summaries,
      warnings: [`Log discovery failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  let filesScanned = 0;
  for (const filePath of files) {
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > maxFileSizeBytes) {
        warnings.push(`Skipped ${filePath}: file exceeds ${maxFileSizeBytes} bytes.`);
        continue;
      }
      const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);
      filesScanned += 1;

      for (const [lineIndex, text] of lines.entries()) {
        for (const [patternIndex, pattern] of failurePatterns.entries()) {
          pattern.expression.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.expression.exec(text)) !== null) {
            const summary = summaries[patternIndex];
            summary.count += 1;
            if (summary.occurrences.length < maxOccurrences) {
              summary.occurrences.push({ filePath, line: lineIndex + 1, text: text.trim() });
            }
            // Avoid an infinite loop if a future expression can match an empty string.
            if (match[0].length === 0) pattern.expression.lastIndex += 1;
          }
        }
      }
    } catch (error: unknown) {
      warnings.push(`Skipped ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    targetPath: resolve(targetPath),
    filesScanned,
    totalMatches: summaries.reduce((total, summary) => total + summary.count, 0),
    patterns: summaries,
    warnings,
  };
}
