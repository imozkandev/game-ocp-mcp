import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const localizationAuditorInputSchema = z.object({
  locDirPath: z.string().trim().min(1, "locDirPath is required"),
  baseLang: z.string().trim().min(1).default("en.json"),
});

export interface LocalizationIssue {
  severity: "error" | "warning";
  code: "DIRECTORY_NOT_FOUND" | "DIRECTORY_READ_FAILED" | "BASE_FILE_NOT_FOUND" | "FILE_READ_FAILED" | "INVALID_JSON" | "INVALID_TRANSLATION_DOCUMENT" | "MISSING_KEY" | "PLACEHOLDER_MISMATCH";
  file?: string;
  key?: string;
  message: string;
  missingPlaceholders?: string[];
  unexpectedPlaceholders?: string[];
}

export interface LocalizationAuditResult {
  ok: boolean;
  baseLanguage: string;
  filesChecked: number;
  errors: LocalizationIssue[];
  warnings: LocalizationIssue[];
}

type FlatTranslations = Map<string, string>;
const placeholderPattern = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function addIssue(result: LocalizationAuditResult, issue: LocalizationIssue): void {
  (issue.severity === "error" ? result.errors : result.warnings).push(issue);
}

function flattenTranslations(value: unknown, prefix = "", output: FlatTranslations = new Map()): FlatTranslations | undefined {
  if (typeof value === "string") {
    if (!prefix) return undefined;
    output.set(prefix, value);
    return output;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!flattenTranslations(child, path, output)) return undefined;
  }
  return output;
}

function parsePlaceholders(text: string): Map<string, number> {
  const values = new Map<string, number>();
  for (const match of text.matchAll(placeholderPattern)) {
    const name = match[1];
    values.set(name, (values.get(name) ?? 0) + 1);
  }
  return values;
}

function difference(left: Map<string, number>, right: Map<string, number>): string[] {
  const values: string[] = [];
  for (const [name, count] of left) {
    const missing = count - (right.get(name) ?? 0);
    for (let index = 0; index < Math.max(0, missing); index += 1) values.push(name);
  }
  return values;
}

async function readTranslationFile(path: string): Promise<{ data?: FlatTranslations; error?: { code: LocalizationIssue["code"]; message: string } }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error: unknown) {
    return { error: { code: "FILE_READ_FAILED", message: (error as Error).message } };
  }
  try {
    const flattened = flattenTranslations(JSON.parse(raw));
    return flattened
      ? { data: flattened }
      : { error: { code: "INVALID_TRANSLATION_DOCUMENT", message: "Expected a JSON object whose leaf values are strings." } };
  } catch (error: unknown) {
    return { error: { code: "INVALID_JSON", message: (error as Error).message } };
  }
}

/**
 * Compares each JSON locale against a reference file, including repeated `{param}`
 * placeholders. Nested translation objects are compared by dot-separated key paths.
 */
export async function auditLocalization(input: unknown): Promise<LocalizationAuditResult> {
  const parsedInput = localizationAuditorInputSchema.safeParse(input);
  const baseLanguage = parsedInput.success ? parsedInput.data.baseLang : "en.json";
  const result: LocalizationAuditResult = { ok: false, baseLanguage, filesChecked: 0, errors: [], warnings: [] };

  if (!parsedInput.success) {
    addIssue(result, { severity: "error", code: "DIRECTORY_READ_FAILED", message: "Invalid tool input." });
    return result;
  }

  let entries: string[];
  try {
    entries = await readdir(parsedInput.data.locDirPath);
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    addIssue(result, {
      severity: "error",
      code: nodeError.code === "ENOENT" ? "DIRECTORY_NOT_FOUND" : "DIRECTORY_READ_FAILED",
      message: nodeError.code === "ENOENT" ? `Localization directory not found: ${parsedInput.data.locDirPath}` : `Could not read localization directory: ${nodeError.message}`,
    });
    return result;
  }

  if (!entries.includes(parsedInput.data.baseLang)) {
    addIssue(result, { severity: "error", code: "BASE_FILE_NOT_FOUND", file: parsedInput.data.baseLang, message: `Base language file not found: ${parsedInput.data.baseLang}` });
    return result;
  }

  const baseFilePath = join(parsedInput.data.locDirPath, parsedInput.data.baseLang);
  const base = await readTranslationFile(baseFilePath);
  if (!base.data) {
    addIssue(result, { severity: "error", code: base.error!.code, file: parsedInput.data.baseLang, message: `Could not parse base language: ${base.error!.message}` });
    return result;
  }

  const localeFiles = entries.filter((entry) => entry.endsWith(".json") && entry !== parsedInput.data.baseLang);
  for (const file of localeFiles) {
    const locale = await readTranslationFile(join(parsedInput.data.locDirPath, file));
    if (!locale.data) {
      addIssue(result, { severity: "error", code: locale.error!.code, file, message: `Could not parse ${file}: ${locale.error!.message}` });
      continue;
    }

    result.filesChecked += 1;
    for (const [key, baseText] of base.data) {
      const translatedText = locale.data.get(key);
      if (translatedText === undefined) {
        addIssue(result, { severity: "error", code: "MISSING_KEY", file, key, message: `${file} is missing translation key "${key}".` });
        continue;
      }

      const baseParameters = parsePlaceholders(baseText);
      const translatedParameters = parsePlaceholders(translatedText);
      const missingPlaceholders = difference(baseParameters, translatedParameters);
      const unexpectedPlaceholders = difference(translatedParameters, baseParameters);
      if (missingPlaceholders.length || unexpectedPlaceholders.length) {
        addIssue(result, {
          severity: "error",
          code: "PLACEHOLDER_MISMATCH",
          file,
          key,
          missingPlaceholders,
          unexpectedPlaceholders,
          message: `${file} has incompatible placeholders for key "${key}".`,
        });
      }
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}
