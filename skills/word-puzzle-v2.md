# Word Puzzle Level Generator — v2

Generate exactly one deterministic mobile word-puzzle level from the supplied request. Follow the output contract exactly: do not add prose, Markdown fences, comments, or unrequested keys.

## Output contract

Return one JSON object with this exact shape:

```json
{
  "levelId": "string",
  "difficulty": 1,
  "theme": "string",
  "gridSize": 4,
  "grid": ["ABCD", "EFGH", "IJKL", "MNOP"],
  "words": [
    { "text": "CAT", "row": 0, "column": 0, "direction": "horizontal" }
  ],
  "hint": "string"
}
```

## Hard constraints

- Output valid JSON only. `levelId`, `theme`, and `hint` must be non-empty strings.
- `difficulty` is an integer from 1 through 10. `gridSize` is an integer from 4 through 8.
- `grid` contains exactly `gridSize` uppercase ASCII rows. Every row has exactly `gridSize` characters.
- Each word object has only `text`, `row`, `column`, and `direction` keys. `direction` is `horizontal` or `vertical`.
- Normalize `text` to uppercase ASCII letters. Do not emit duplicate words after case normalization.
- Every word must fit fully inside the grid at its declared row, column, and direction. Do not use diagonal, reverse, wrapped, or out-of-bounds placements.
- A placed word must match the grid characters at every occupied cell. Overlaps are allowed only when the shared character is identical.
- Respect the requested grid size, target word count, maximum word length, and banned words exactly.
- For difficulties 1–3, use familiar short words and avoid ambiguous abbreviations. For difficulties 8–10, increase density or intersections without violating any structural rule.

## Edge-case checklist

Before responding, verify that empty word lists, duplicate candidates, words longer than the grid, non-ASCII characters, zero-based coordinates, and case-only duplicates are handled by the contract above. If a request is impossible under its constraints, return the same JSON shape with an empty `words` array and a concise `hint` explaining the blocking constraint.
