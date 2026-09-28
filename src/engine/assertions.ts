import type { ZodSchema } from "zod";

/** Returns true when the complete string can be parsed as JSON. */
export function isValidJson(output: string): boolean {
  try {
    JSON.parse(output);
    return true;
  } catch {
    return false;
  }
}

/** Returns true when an object satisfies the provided Zod schema. */
export function matchesSchema(output: object, schema: ZodSchema): boolean {
  return schema.safeParse(output).success;
}

/** Counts Unicode code points rather than UTF-16 code units. */
export function withinLength(text: string, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return false;
  const length = Array.from(text).length;
  return length >= min && length <= max;
}

/**
 * Requires every required keyword and rejects every forbidden keyword.
 * Matching is deterministic and case-insensitive.
 */
export function containsKeywords(text: string, required: string[], forbidden: string[]): boolean {
  const normalizedText = text.toLocaleLowerCase();
  const includes = (keyword: string): boolean => normalizedText.includes(keyword.toLocaleLowerCase());
  return required.every(includes) && forbidden.every((keyword) => !includes(keyword));
}
