# skill-eval-ci

`skill-eval-ci` is a zero-cost regression harness for coding-agent skills and system prompts. It turns an otherwise subjective prompt change into a repeatable pull-request check: evaluate a baseline, evaluate the candidate, calculate the delta, and publish the evidence as Markdown.

## The interview exercise it solves

The challenge *“Improve a skill and write an eval that proves it got better”* needs more than a stronger-looking prompt. It needs a controlled way to demonstrate that the new prompt meets a concrete contract more often than the old one.

This repository implements that loop directly:

1. [word-puzzle-v1.md](skills/word-puzzle-v1.md) is deliberately under-specified.
2. [word-puzzle-v2.md](skills/word-puzzle-v2.md) makes the JSON shape, puzzle constraints, and edge cases explicit.
3. The eval engine checks captured outputs deterministically for JSON validity, Zod schemas, length, required terms, and forbidden terms.
4. The comparator turns baseline versus candidate results into a pass-rate and score delta.
5. GitHub Actions posts the result back to the pull request, so a regression is visible before merge.

No hosted model or paid API is invoked. The dataset holds resolved/captured outputs and the rules that judge them, which makes runs reproducible locally and in CI.

## How it works

```text
skills/word-puzzle-v1.md ─┐
                          ├─> captured outputs + deterministic assertions ─> baseline result
skills/word-puzzle-v2.md ─┘                                      │
                                                                 ├─> comparator ─> PR Markdown comment
evals/datasets/*.json ──────────────────────────────────────────┘
```

`run` evaluates a resolved dataset (each scenario has `input`, `output`, and `criteria`). `compare` consumes the JSON results emitted by `run`; this keeps model execution separate from deterministic evaluation and lets a team use captured fixtures, a local model, or another generator without changing the CI rules.

## Run locally for free

Requires Node.js 20+ and npm.

```bash
npm install
npm run build
npm run test:eval
```

Generate a candidate result and its one-run Markdown report:

```bash
mkdir -p artifacts
node dist/cli.js run \
  --dataset evals/datasets/resolved-smoke.json \
  --output-json artifacts/v2-current.json \
  --output-md artifacts/v2-current.md
```

Compare it with the committed v1 baseline and write a PR-ready report:

```bash
node dist/cli.js compare \
  --baseline evals/baselines/word-puzzle-v1.result.json \
  --candidate artifacts/v2-current.json \
  --output-md artifacts/comparison.md
```

The same commands work through the package entry point during development:

```bash
npm run eval -- run --dataset evals/datasets/resolved-smoke.json
npm run eval -- compare \
  --baseline evals/baselines/word-puzzle-v1.result.json \
  --candidate artifacts/v2-current.json
```

## GitHub Actions and PR comments

[ci.yml](.github/workflows/ci.yml) is the main pull-request and `main`-branch workflow. It installs with `npm ci`, builds every TypeScript module, runs the Balance Linter, Localization Auditor, Unity Guard, and skill-eval checks, then posts one consolidated benchmark comment. [eval-regression.yml](.github/workflows/eval-regression.yml) remains available for manually running only the standalone skill-eval report.

The workflow only uses the repository’s `GITHUB_TOKEN`; it needs `pull-requests: write` and `issues: write` to publish the comment. On repositories that restrict tokens from forked pull requests, the evaluation still runs, but repository settings may need to permit PR comments from workflows.

### Run from GitHub without a CLI

Open the repository’s **Actions** tab, choose **Studio AI Toolkit CI & Evals**, then select **Run workflow** to run the complete suite on demand. Choose **Standalone skill eval report** when only the skill benchmark is needed; entering a PR number in its optional field updates that PR with the Markdown benchmark comment.

### Optional CLI trigger

The GitHub UI needs no local credentials beyond the user’s normal GitHub session. If a terminal trigger is preferred, install the GitHub CLI and authorize it locally—never paste a token into source code or chat:

```bash
gh auth login
gh workflow run "Studio AI Toolkit CI & Evals" --repo imozkandev/game-ocp-mcp
gh workflow run "Standalone skill eval report" --repo imozkandev/game-ocp-mcp --field pr_number=123
```

Example comment:

```markdown
## Skill eval regression report

| Metric | v1 (Baseline) | v2 (Current) | Delta |
| --- | ---: | ---: | ---: |
| Score | 50% | 100% | +50% |
| Pass Rate | 50% | 100% | +50% |

**📈 Improvement:** Pass Rate: 50% -> 100% (+50%, improvement).

| Scenario | v1 | v2 | Delta | Outcome |
| --- | ---: | ---: | ---: | --- |
| json-contract | 0% | 100% | +100% | 📈 Improvement |
| forbidden-copy | 100% | 100% | +0% | ➖ Unchanged |
```

## Dataset shape

The runner deliberately has no model-provider dependency. A resolved scenario looks like this:

```json
{
  "id": "json-contract",
  "input": "Return a starter puzzle level.",
  "output": "{\"title\":\"Play easy\",\"difficulty\":\"easy\"}",
  "criteria": {
    "validJson": true,
    "requiredKeywords": ["play", "easy"],
    "forbiddenKeywords": ["placeholder"]
  }
}
```

Available deterministic assertions:

- `validJson`: output parses as JSON.
- `schema`: runtime Zod schema validation for programmatic callers.
- `minLength` / `maxLength`: Unicode-aware character bounds.
- `requiredKeywords` / `forbiddenKeywords`: case-insensitive content constraints.

## Commands

```text
skill-eval run --dataset <resolved-dataset.json> [--output-json result.json] [--output-md report.md]
skill-eval compare --baseline <result.json> --candidate <result.json> [--output-md report.md]
```

`run` exits with status `1` when any scenario fails. `compare` exits with status `1` only for a regression, making both commands suitable for local hooks and CI.

## Web dashboard

The existing local dashboard also exposes **Tool 06 · Skill Eval CI**. It runs the same deterministic v1 baseline versus v2 smoke comparison and shows the scenario deltas plus a copy-ready PR-comment preview.

```bash
npm run web
```

Open `http://127.0.0.1:3000`, choose **Skill Eval CI**, then select **Run comparison**. The dashboard reads only local fixtures and does not use the optional API keys.

## Project layout

```text
src/engine/       assertions, runner, and comparator
src/reporters/    PR-comment Markdown renderer
src/cli.ts        skill-eval command-line interface
skills/           v1 and v2 prompt examples
evals/datasets/   scenarios and resolved smoke fixture
evals/baselines/  committed baseline result
.github/workflows/ci.yml       consolidated PR and main-branch CI
.github/workflows/eval-regression.yml
```

## License

[MIT](LICENSE)
