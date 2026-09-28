import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import pidusage from "pidusage";

const execFileAsync = promisify(execFile);
const agentProcessPattern = /claude|cursor|codex|mcp|python(?:\d+(?:\.\d+)?)?/i;

interface PsProcess {
  pid: number;
  command: string;
  uptimeSeconds: number;
}

export interface AgentProcess {
  pid: number;
  name: string;
  command: string;
  cpuPercent: number;
  memoryBytes: number;
  memoryMb: number;
  uptimeSeconds: number;
  uptime: string;
  metricsAvailable: boolean;
}

export interface ProcessScanResult {
  processes: AgentProcess[];
  scannedAt: string;
  warnings: string[];
}

function parseElapsedTime(value: string): number | undefined {
  // `ps etime` is [[days-]hours:]minutes:seconds on both Darwin and procps.
  const parts = value.trim().split(/[\-:]/).map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.length > 4 || parts.some((part) => Number.isNaN(part) || part < 0)) return undefined;

  let days = 0;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 4) [days, hours, minutes, seconds] = parts;
  if (parts.length === 3) [hours, minutes, seconds] = parts;
  if (parts.length === 2) [minutes, seconds] = parts;
  return days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
}

function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const time = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  return days > 0 ? `${days}d ${time}` : time;
}

function displayName(command: string): string {
  const executable = command.trim().split(/\s+/)[0] || command;
  return basename(executable) || command;
}

function parsePsOutput(output: string, warnings: string[]): PsProcess[] {
  const processes: PsProcess[] = [];
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(.+?)\s+(\d+(?:-\d{1,2})?(?::\d{1,2}){1,2})$/);
    if (!match) continue;

    const uptimeSeconds = parseElapsedTime(match[3]);
    if (uptimeSeconds === undefined) {
      warnings.push(`Could not parse elapsed time for PID ${match[1]}.`);
      continue;
    }
    if (agentProcessPattern.test(match[2])) {
      processes.push({ pid: Number.parseInt(match[1], 10), command: match[2], uptimeSeconds });
    }
  }
  return processes;
}

async function collectMetrics(process: PsProcess, warnings: string[]): Promise<AgentProcess> {
  try {
    const metrics = await pidusage(process.pid);
    const memoryMb = Math.round((metrics.memory / 1_048_576) * 10) / 10;
    return {
      pid: process.pid,
      name: displayName(process.command),
      command: process.command,
      cpuPercent: Math.round(metrics.cpu * 10) / 10,
      memoryBytes: metrics.memory,
      memoryMb,
      uptimeSeconds: process.uptimeSeconds,
      uptime: formatUptime(process.uptimeSeconds),
      metricsAvailable: true,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Metrics unavailable for PID ${process.pid}: ${message}`);
    return {
      pid: process.pid,
      name: displayName(process.command),
      command: process.command,
      cpuPercent: 0,
      memoryBytes: 0,
      memoryMb: 0,
      uptimeSeconds: process.uptimeSeconds,
      uptime: formatUptime(process.uptimeSeconds),
      metricsAvailable: false,
    };
  }
}

/**
 * Finds local Claude, Cursor, Codex, MCP, and Python processes and collects
 * per-process CPU, memory, and elapsed-runtime metrics without mutating them.
 */
export async function scanAgentProcesses(): Promise<ProcessScanResult> {
  const warnings: string[] = [];
  let stdout: string;
  try {
    // `-a`, `-x`, `command`, and `etime` are supported by macOS and Linux ps.
    ({ stdout } = await execFileAsync("ps", ["-axo", "pid=,command=,etime="], { maxBuffer: 10 * 1_024 * 1_024 }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { processes: [], scannedAt: new Date().toISOString(), warnings: [`Process discovery failed: ${message}`] };
  }

  const discovered = parsePsOutput(stdout, warnings);
  const processes = await Promise.all(discovered.map((process) => collectMetrics(process, warnings)));
  processes.sort((left, right) => right.cpuPercent - left.cpuPercent || right.memoryBytes - left.memoryBytes);

  return { processes, scannedAt: new Date().toISOString(), warnings };
}
