#!/usr/bin/env node

import process from "node:process";
import chalk from "chalk";
import { Command } from "commander";
import { getBorderCharacters, table } from "table";
import { scanAgentLogs } from "./scanner/logScanner.js";
import { scanAgentProcesses, type AgentProcess, type ProcessScanResult } from "./scanner/processScanner.js";

const program = new Command();

function formatCpu(processInfo: AgentProcess): string {
  if (!processInfo.metricsAvailable) return chalk.dim("n/a");
  const value = `${processInfo.cpuPercent.toFixed(1)}%`;
  if (processInfo.cpuPercent >= 90) return chalk.red(value);
  if (processInfo.cpuPercent >= 60) return chalk.yellow(value);
  return chalk.green(value);
}

function formatMemory(processInfo: AgentProcess): string {
  return processInfo.metricsAvailable ? `${processInfo.memoryMb.toFixed(1)} MB` : chalk.dim("n/a");
}

function shorten(value: string, maximumLength = 52): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1)}…` : value;
}

function printWarnings(warnings: string[]): void {
  for (const warning of warnings) console.log(chalk.yellow(`Warning: ${warning}`));
}

function printProcessTable(scan: ProcessScanResult): void {
  const rows = [
    [chalk.bold("PID"), chalk.bold("AGENT"), chalk.bold("CPU"), chalk.bold("MEMORY"), chalk.bold("UPTIME"), chalk.bold("COMMAND")],
    ...scan.processes.map((processInfo) => [
      String(processInfo.pid),
      processInfo.name,
      formatCpu(processInfo),
      formatMemory(processInfo),
      processInfo.uptime,
      chalk.dim(shorten(processInfo.command)),
    ]),
  ];

  if (scan.processes.length === 0) rows.push([chalk.dim("—"), chalk.dim("No matching agent processes"), "", "", "", ""]);
  console.log(table(rows, { border: getBorderCharacters("norc"), drawHorizontalLine: (index) => index === 0 || index === 1 || index === rows.length }));
}

async function listAgents(clearScreen = false): Promise<boolean> {
  if (clearScreen) process.stdout.write("\x1Bc");
  const scan = await scanAgentProcesses();
  console.log(chalk.bold("agent-mon") + chalk.dim(` · scanned ${new Date(scan.scannedAt).toLocaleTimeString()}`));
  printProcessTable(scan);
  printWarnings(scan.warnings);
  return !scan.warnings.some((warning) => warning.startsWith("Process discovery failed"));
}

function parseInterval(value: string): number {
  const seconds = Number.parseFloat(value);
  if (!Number.isFinite(seconds) || seconds < 0.5) throw new Error("Interval must be at least 0.5 seconds.");
  return seconds;
}

async function watchAgents(intervalSeconds: number, once: boolean): Promise<void> {
  let stopped = false;
  const stop = (): void => { stopped = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    do {
      await listAgents(true);
      if (once || stopped) break;
      console.log(chalk.dim(`Refreshing every ${intervalSeconds}s · Press Ctrl+C to stop`));
      await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1_000));
    } while (!stopped);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

async function auditLogs(logPath: string): Promise<boolean> {
  const result = await scanAgentLogs(logPath);
  console.log(chalk.bold(`agent-mon audit ${chalk.dim(result.targetPath)}`));
  const rows = [
    [chalk.bold("PATTERN"), chalk.bold("MATCHES"), chalk.bold("FIRST OCCURRENCE")],
    ...result.patterns.map((summary) => {
      const first = summary.occurrences[0];
      return [
        summary.count > 0 ? chalk.yellow(summary.name) : summary.name,
        String(summary.count),
        first ? `${first.filePath}:${first.line}` : chalk.dim("—"),
      ];
    }),
  ];
  console.log(table(rows, { border: getBorderCharacters("norc"), drawHorizontalLine: (index) => index === 0 || index === 1 || index === rows.length }));
  console.log(result.totalMatches > 0 ? chalk.yellow(`Found ${result.totalMatches} failure-pattern match${result.totalMatches === 1 ? "" : "es"}.`) : chalk.green("No configured failure patterns found."));
  printWarnings(result.warnings);
  return !result.warnings.some((warning) => warning.startsWith("Log discovery failed"));
}

program
  .name("agent-mon")
  .description("Local developer-agent process monitor for macOS and Linux.")
  .version("0.1.0");

program
  .command("top")
  .description("Show one snapshot of local AI-agent process resource usage.")
  .action(async () => {
    process.exitCode = (await listAgents()) ? 0 : 1;
  });

program
  .command("list")
  .description("List matching local AI-agent processes and their resource usage.")
  .action(async () => {
    process.exitCode = (await listAgents()) ? 0 : 1;
  });

program
  .command("watch")
  .description("Continuously refresh the local AI-agent process table.")
  .option("-i, --interval <seconds>", "Refresh interval in seconds (minimum: 0.5).", parseInterval, 2)
  .option("--once", "Render one refresh and exit; useful for automation.")
  .action(async (options: { interval: number; once?: boolean }) => {
    await watchAgents(options.interval, options.once ?? false);
  });

program
  .command("audit <logPath>")
  .description("Summarize RateLimit, ContextWindowExceeded, and ECONNREFUSED patterns in agent logs.")
  .action(async (logPath: string) => {
    process.exitCode = (await auditLogs(logPath)) ? 0 : 1;
  });

await program.parseAsync();
