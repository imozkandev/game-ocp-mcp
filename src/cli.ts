#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { z } from "zod";
import { compareEvalResults, type EvalComparison } from "./engine/comparator.js";
import { evalScenarioSchema, runDataset, type EvalRunResult, type EvalScenario } from "./engine/runner.js";
import { renderComparisonMarkdown, renderEvalMarkdown } from "./reporters/markdownReporter.js";

const program = new Command();

const evalRunResultSchema = z.object({
  score: z.number(),
  passedTests: z.number().int().nonnegative(),
  failedTests: z.number().int().nonnegative(),
  totalTests: z.number().int().nonnegative(),
  scenarios: z.array(z.object({
    id: z.string(),
    input: z.string(),
    score: z.number(),
    passed: z.boolean(),
    passedTests: z.array(z.string()),
    failedTests: z.array(z.string()),
    errors: z.array(z.string()),
    checks: z.array(z.object({ name: z.enum(["valid-json", "schema", "length", "keywords"]), passed: z.boolean(), message: z.string() })),
  })),
});

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error: unknown) {
    throw new Error(`Could not read JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadResolvedDataset(path: string): Promise<EvalScenario[]> {
  const source = await readJson(path);
  const values = Array.isArray(source) ? source : source && typeof source === "object" && Array.isArray((source as { scenarios?: unknown }).scenarios) ? (source as { scenarios: unknown[] }).scenarios : undefined;
  if (!values) throw new Error("Dataset must be an array or an object with a scenarios array.");

  return values.map((value, index) => {
    const parsed = evalScenarioSchema.safeParse(value);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `${issue.path.join(".") || "scenario"}: ${issue.message}`).join("; ");
      throw new Error(`Invalid resolved scenario at index ${index}: ${details}`);
    }
    return parsed.data;
  });
}

async function loadEvalResult(path: string): Promise<EvalRunResult> {
  const parsed = evalRunResultSchema.safeParse(await readJson(path));
  if (!parsed.success) throw new Error(`Invalid eval result in ${path}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  return parsed.data;
}

function printRunSummary(result: EvalRunResult): void {
  const color = result.failedTests === 0 ? chalk.green : chalk.yellow;
  console.log(color(`Score ${result.score}% · ${result.passedTests}/${result.totalTests} scenarios passed`));
  for (const scenario of result.scenarios) {
    console.log(`${scenario.passed ? chalk.green("PASS") : chalk.red("FAIL")} ${scenario.id} ${chalk.dim(`${scenario.score}%`)}`);
    for (const error of scenario.errors) console.log(chalk.red(`  ↳ ${error}`));
  }
}

function printComparisonSummary(comparison: EvalComparison): void {
  const color = comparison.outcome === "improvement" ? chalk.green : comparison.outcome === "regression" ? chalk.red : chalk.yellow;
  console.log(color(comparison.summary));
  for (const scenario of comparison.scenarios) {
    const scenarioColor = scenario.outcome === "improvement" ? chalk.green : scenario.outcome === "regression" ? chalk.red : chalk.dim;
    console.log(scenarioColor(`${scenario.id}: ${scenario.baselineScore}% -> ${scenario.candidateScore}% (${scenario.delta >= 0 ? "+" : ""}${scenario.delta}%)`));
  }
}

async function saveMarkdown(path: string | undefined, markdown: string): Promise<void> {
  if (!path) return;
  await writeFile(resolve(path), markdown, "utf8");
  console.log(chalk.cyan(`Markdown report written to ${resolve(path)}`));
}

async function saveJson(path: string | undefined, result: EvalRunResult): Promise<void> {
  if (!path) return;
  await writeFile(resolve(path), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(chalk.cyan(`Machine-readable result written to ${resolve(path)}`));
}

program
  .name("skill-eval")
  .description("Deterministic regression evaluations for coding-agent skills and system prompts.");

program
  .command("run")
  .description("Run a resolved dataset containing input, output, and criteria fields.")
  .requiredOption("--dataset <path>", "Path to a resolved eval dataset JSON file.")
  .option("--output-md <path>", "Write the Markdown evaluation report to this path.")
  .option("--output-json <path>", "Write the EvalRunResult JSON used by the compare command.")
  .action(async (options: { dataset: string; outputMd?: string; outputJson?: string }) => {
    try {
      const result = runDataset(await loadResolvedDataset(options.dataset));
      printRunSummary(result);
      await saveMarkdown(options.outputMd, renderEvalMarkdown(result));
      await saveJson(options.outputJson, result);
      process.exitCode = result.failedTests === 0 ? 0 : 1;
    } catch (error: unknown) {
      console.error(chalk.red(`skill-eval: ${error instanceof Error ? error.message : String(error)}`));
      process.exitCode = 1;
    }
  });

program
  .command("compare")
  .description("Compare two saved EvalRunResult JSON files.")
  .requiredOption("--baseline <path>", "Baseline EvalRunResult JSON file.")
  .requiredOption("--candidate <path>", "Candidate EvalRunResult JSON file.")
  .option("--output-md <path>", "Write the Markdown comparison report to this path.")
  .action(async (options: { baseline: string; candidate: string; outputMd?: string }) => {
    try {
      const comparison = compareEvalResults(await loadEvalResult(options.baseline), await loadEvalResult(options.candidate));
      printComparisonSummary(comparison);
      await saveMarkdown(options.outputMd, renderComparisonMarkdown(comparison));
      process.exitCode = comparison.outcome === "regression" ? 1 : 0;
    } catch (error: unknown) {
      console.error(chalk.red(`skill-eval: ${error instanceof Error ? error.message : String(error)}`));
      process.exitCode = 1;
    }
  });

await program.parseAsync();
