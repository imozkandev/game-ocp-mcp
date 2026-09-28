import type { AgentProcess, ProcessScanResult } from "../scanner/processScanner.js";
import { scanAgentProcesses } from "../scanner/processScanner.js";

export type WatchdogAlarmType = "sustained-high-cpu" | "unresponsive-metrics";

export interface WatchdogAlarm {
  type: WatchdogAlarmType;
  pid: number;
  name: string;
  command: string;
  cpuPercent: number;
  durationMs: number;
  message: string;
  recommendation: string;
  killResult?: KillResult;
}

export interface KillResult {
  pid: number;
  terminated: boolean;
  signal?: "SIGTERM" | "SIGKILL";
  message: string;
}

export interface WatchdogCheckResult {
  scannedAt: string;
  alarms: WatchdogAlarm[];
  warnings: string[];
}

export interface WatchdogOptions {
  /** CPU percentage that starts the sustained-load timer. Defaults to 90. */
  highCpuPercent?: number;
  /** Sustained high-CPU duration before an alarm. Defaults to ten minutes. */
  highCpuDurationMs?: number;
  /** Consecutive unavailable-metric duration before an unresponsive alarm. Defaults to ten minutes. */
  unresponsiveDurationMs?: number;
  /** Poll period for start(). Defaults to ten seconds. */
  intervalMs?: number;
  /** Send signals after an alarm. Disabled by default. */
  killOnThreshold?: boolean;
  /** Optional alarm observer for a CLI, daemon, or TUI. */
  onAlarm?: (alarm: WatchdogAlarm) => void | Promise<void>;
  /** Injectable source for deterministic tests. */
  scan?: () => Promise<ProcessScanResult>;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

const defaults = {
  highCpuPercent: 90,
  highCpuDurationMs: 10 * 60 * 1_000,
  unresponsiveDurationMs: 10 * 60 * 1_000,
  intervalMs: 10_000,
  killOnThreshold: false,
};

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // EPERM means the PID exists but belongs to a process we may not signal.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Safely attempts SIGTERM first, then SIGKILL only after the grace period. */
export async function killProcess(pid: number, gracePeriodMs = 5_000): Promise<KillResult> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { pid, terminated: false, message: "PID must be a positive integer." };
  }
  if (pid === process.pid || pid === process.ppid) {
    return { pid, terminated: false, message: "Refusing to terminate the monitor process or its parent." };
  }
  if (!isProcessAlive(pid)) {
    return { pid, terminated: true, message: "Process has already exited." };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error: unknown) {
    return { pid, terminated: false, message: `SIGTERM failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  const deadline = Date.now() + Math.max(0, gracePeriodMs);
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return { pid, terminated: true, signal: "SIGTERM", message: "Process terminated after SIGTERM." };
    await wait(100);
  }
  if (!isProcessAlive(pid)) return { pid, terminated: true, signal: "SIGTERM", message: "Process terminated after SIGTERM." };

  try {
    process.kill(pid, "SIGKILL");
    return { pid, terminated: true, signal: "SIGKILL", message: "Process did not exit during the grace period and received SIGKILL." };
  } catch (error: unknown) {
    return { pid, terminated: false, message: `SIGKILL failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Stateful runaway-process detector. High CPU must be observed continuously
 * across scans before an alarm is emitted; no process is killed by default.
 */
export class AgentWatchdog {
  private readonly options: Required<Pick<WatchdogOptions, "highCpuPercent" | "highCpuDurationMs" | "unresponsiveDurationMs" | "intervalMs" | "killOnThreshold">> & WatchdogOptions;
  private readonly highCpuSince = new Map<number, number>();
  private readonly unresponsiveSince = new Map<number, number>();
  private readonly alarmed = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private checking = false;

  public constructor(options: WatchdogOptions = {}) {
    this.options = { ...defaults, ...options };
  }

  public async checkOnce(): Promise<WatchdogCheckResult> {
    if (this.checking) return { scannedAt: new Date().toISOString(), alarms: [], warnings: ["A watchdog scan is already in progress."] };
    this.checking = true;
    try {
      const scan = await (this.options.scan ?? scanAgentProcesses)();
      const now = (this.options.now ?? Date.now)();
      const alarms: WatchdogAlarm[] = [];
      const seenPids = new Set(scan.processes.map((process) => process.pid));

      for (const pid of [...this.highCpuSince.keys()]) if (!seenPids.has(pid)) this.highCpuSince.delete(pid);
      for (const pid of [...this.unresponsiveSince.keys()]) if (!seenPids.has(pid)) this.unresponsiveSince.delete(pid);
      for (const key of [...this.alarmed]) if (!seenPids.has(Number.parseInt(key.split(":")[1], 10))) this.alarmed.delete(key);

      for (const process of scan.processes) {
        const alarm = await this.evaluateProcess(process, now);
        if (alarm) {
          alarms.push(alarm);
          await this.options.onAlarm?.(alarm);
        }
      }

      return { scannedAt: scan.scannedAt, alarms, warnings: scan.warnings };
    } finally {
      this.checking = false;
    }
  }

  public start(): void {
    if (this.timer) return;
    void this.checkOnce();
    this.timer = setInterval(() => void this.checkOnce(), this.options.intervalMs);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  public get isRunning(): boolean {
    return this.timer !== undefined;
  }

  private async evaluateProcess(process: AgentProcess, now: number): Promise<WatchdogAlarm | undefined> {
    if (process.metricsAvailable && process.cpuPercent >= this.options.highCpuPercent) {
      const since = this.highCpuSince.get(process.pid) ?? now;
      this.highCpuSince.set(process.pid, since);
      this.unresponsiveSince.delete(process.pid);
      return this.createAlarmIfNeeded("sustained-high-cpu", process, now - since);
    }

    this.highCpuSince.delete(process.pid);
    if (!process.metricsAvailable && isProcessAlive(process.pid)) {
      const since = this.unresponsiveSince.get(process.pid) ?? now;
      this.unresponsiveSince.set(process.pid, since);
      return this.createAlarmIfNeeded("unresponsive-metrics", process, now - since);
    }

    this.unresponsiveSince.delete(process.pid);
    this.alarmed.delete(`sustained-high-cpu:${process.pid}`);
    this.alarmed.delete(`unresponsive-metrics:${process.pid}`);
    return undefined;
  }

  private async createAlarmIfNeeded(type: WatchdogAlarmType, process: AgentProcess, durationMs: number): Promise<WatchdogAlarm | undefined> {
    const threshold = type === "sustained-high-cpu" ? this.options.highCpuDurationMs : this.options.unresponsiveDurationMs;
    const key = `${type}:${process.pid}`;
    if (durationMs < threshold || this.alarmed.has(key)) return undefined;
    this.alarmed.add(key);

    const alarm: WatchdogAlarm = type === "sustained-high-cpu"
      ? {
          type,
          pid: process.pid,
          name: process.name,
          command: process.command,
          cpuPercent: process.cpuPercent,
          durationMs,
          message: `PID ${process.pid} has used at least ${this.options.highCpuPercent}% CPU continuously for ${Math.round(durationMs / 1_000)} seconds.`,
          recommendation: "Inspect the agent's current task and logs. Enable killOnThreshold only when automatic termination is acceptable.",
        }
      : {
          type,
          pid: process.pid,
          name: process.name,
          command: process.command,
          cpuPercent: process.cpuPercent,
          durationMs,
          message: `PID ${process.pid} remains alive but has not returned resource metrics for ${Math.round(durationMs / 1_000)} seconds.`,
          recommendation: "Inspect logs and process state before terminating it; unavailable metrics alone do not prove a runaway loop.",
        };

    if (this.options.killOnThreshold) alarm.killResult = await killProcess(process.pid);
    return alarm;
  }
}
