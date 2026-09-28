import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { glob } from "glob";
import { analyzeUnitySource } from "./index.js";
import type { GuardrailReport, GuardrailViolation } from "./types.js";

export interface UnityGuardScanResult {
  inputPath: string;
  filesScanned: number;
  totalViolations: number;
  reports: GuardrailReport[];
  violations: GuardrailViolation[];
}

async function findCSharpFiles(targetPath: string): Promise<string[]> {
  const absoluteTarget = resolve(targetPath);
  let targetStat;
  try {
    targetStat = await stat(absoluteTarget);
  } catch {
    throw new Error(`Path does not exist: ${targetPath}`);
  }

  if (targetStat.isFile()) {
    if (extname(absoluteTarget).toLowerCase() !== ".cs") {
      throw new Error(`Expected a .cs file: ${absoluteTarget}`);
    }
    return [absoluteTarget];
  }
  if (!targetStat.isDirectory()) {
    throw new Error(`Expected a directory or .cs file: ${targetPath}`);
  }

  return glob("**/*.cs", {
    cwd: absoluteTarget,
    absolute: true,
    nodir: true,
    ignore: ["**/.git/**", "**/Library/**", "**/Temp/**", "**/obj/**", "**/bin/**"],
  });
}

/** Scans a Unity C# file or directory with the same deterministic rules used by the CLI. */
export async function scanUnityPath(targetPath: string): Promise<UnityGuardScanResult> {
  const files = (await findCSharpFiles(targetPath)).sort();
  const reports: GuardrailReport[] = [];

  for (const filePath of files) {
    reports.push(analyzeUnitySource(await readFile(filePath, "utf8"), filePath));
  }

  const violations = reports.flatMap((report) => report.violations);
  return {
    inputPath: resolve(targetPath),
    filesScanned: files.length,
    totalViolations: violations.length,
    reports,
    violations,
  };
}
