const tabs = [...document.querySelectorAll(".tab")];
const panels = [...document.querySelectorAll(".panel")];
const resultState = document.querySelector("#result-state");
const resultEmpty = document.querySelector("#result-empty");
const resultBody = document.querySelector("#result-body");
const resultSummary = document.querySelector("#result-summary");
const issuesList = document.querySelector("#issues-list");
const rawOutput = document.querySelector("#raw-output");
const markdownPreview = document.querySelector("#markdown-preview");
const markdownPreviewDetails = document.querySelector("#markdown-preview-details");
const evalType = document.querySelector("#eval-type");
const generatedOutput = document.querySelector("#generated-output");
const openAiKey = document.querySelector("#openai-key");
const anthropicKey = document.querySelector("#anthropic-key");
const unityPath = document.querySelector("#unity-path");
const settingsDialog = document.querySelector("#settings-dialog");
const monitorLive = document.querySelector("#monitor-live");
const monitorInterval = document.querySelector("#monitor-interval");
const monitorLogPath = document.querySelector("#monitor-log-path");
let monitorTimer;

const wordPuzzleExample = {
  grid: ["CAT", "DOG", "SUN"],
  words: [
    { word: "CAT", row: 0, column: 0, direction: "horizontal" },
    { word: "DOG", row: 1, column: 0, direction: "horizontal" },
  ],
};
const notificationExample = {
  title: "New quest unlocked!",
  body: "Play now to claim your reward.",
  cta: "Play now",
};

function activateTab(name) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  panels.forEach((panel) => {
    const active = panel.id === `${name}-panel`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  if (name !== "monitor") stopMonitorRefresh();
}

function setState(state, label) {
  resultState.className = `result-state ${state}`;
  resultState.textContent = label;
}

function addItem(kind, title, description) {
  const item = document.createElement("li");
  item.className = kind;
  const heading = document.createElement("b");
  heading.textContent = title;
  item.append(heading, document.createTextNode(description));
  issuesList.append(item);
}

function renderResult(result) {
  resultEmpty.hidden = true;
  resultBody.hidden = false;
  issuesList.replaceChildren();
  rawOutput.textContent = JSON.stringify(result, null, 2);
  markdownPreviewDetails.hidden = typeof result.markdown !== "string";
  markdownPreview.textContent = typeof result.markdown === "string" ? result.markdown : "";

  if ("comparison" in result) {
    const { baselineScore, candidateScore, scoreDelta, baselinePassRate, candidatePassRate, passRateDelta, outcome, scenarios } = result.comparison;
    resultSummary.textContent = `v1 ${baselineScore}% → v2 ${candidateScore}% · pass rate ${baselinePassRate}% → ${candidatePassRate}% · ${outcome}`;
    const resultKind = outcome === "improvement" ? "pass" : outcome === "regression" ? "error" : "warning";
    addItem(resultKind, `${outcome.toUpperCase()} · ${scoreDelta >= 0 ? "+" : ""}${scoreDelta}% SCORE`, `Pass rate changed by ${passRateDelta >= 0 ? "+" : ""}${passRateDelta}% across ${scenarios.length} scenarios.`);
    scenarios.forEach((scenario) => {
      const kind = scenario.outcome === "improvement" ? "pass" : scenario.outcome === "regression" ? "error" : "warning";
      addItem(kind, `${scenario.outcome.toUpperCase()} · ${scenario.id}`, `v1 ${scenario.baselineScore}% → v2 ${scenario.candidateScore}% (${scenario.delta >= 0 ? "+" : ""}${scenario.delta}%).`);
    });
  } else if ("processes" in result) {
    resultSummary.textContent = `${result.processes.length} matching agent process${result.processes.length === 1 ? "" : "es"} · scanned ${new Date(result.scannedAt).toLocaleTimeString()}`;
    if (result.processes.length === 0) addItem("pass", "CLEAR", "No matching local agent processes are running.");
    result.processes.forEach((processInfo) => {
      const kind = !processInfo.metricsAvailable || processInfo.cpuPercent < 60 ? "pass" : processInfo.cpuPercent < 90 ? "warning" : "error";
      const metrics = processInfo.metricsAvailable ? `${processInfo.cpuPercent.toFixed(1)}% CPU · ${processInfo.memoryMb.toFixed(1)} MB · ${processInfo.uptime}` : `Metrics unavailable · ${processInfo.uptime}`;
      addItem(kind, `${processInfo.name} · PID ${processInfo.pid}`, `${metrics} · ${processInfo.command}`);
    });
    (result.warnings || []).forEach((warning) => addItem("warning", "SCANNER WARNING", warning));
  } else if ("patterns" in result) {
    resultSummary.textContent = `${result.filesScanned} log file${result.filesScanned === 1 ? "" : "s"} scanned · ${result.totalMatches} failure-pattern match${result.totalMatches === 1 ? "" : "es"}`;
    result.patterns.forEach((pattern) => {
      const first = pattern.occurrences[0];
      addItem(pattern.count > 0 ? "warning" : "pass", `${pattern.name} · ${pattern.count}`, first ? `${first.filePath}:${first.line} · ${first.text}` : "No matches.");
    });
    (result.warnings || []).forEach((warning) => addItem("warning", "AUDIT WARNING", warning));
  } else if ("totalViolations" in result) {
    resultSummary.textContent = `${result.filesScanned} C# file${result.filesScanned === 1 ? "" : "s"} scanned · ${result.totalViolations} violation${result.totalViolations === 1 ? "" : "s"}`;
    if (result.violations.length === 0) addItem("pass", "PASS", "No Unity Guard violations found.");
    result.violations.forEach((violation) => addItem("warning", `${violation.ruleName} · ${violation.fileName}:${violation.line}`, `${violation.message} Fix: ${violation.recommendation}`));
  } else if ("score" in result) {
    resultSummary.textContent = `${result.taskType} · score ${result.score}/100 · ${result.ok ? "all checks passed" : "checks need attention"}`;
    result.scenarios.forEach((scenario) => addItem(scenario.passed ? "pass" : "error", scenario.passed ? `PASS · ${scenario.name}` : `FAIL · ${scenario.name}`, scenario.failureReason || "Rule passed."));
  } else {
    const issues = [...(result.errors || []), ...(result.warnings || [])];
    resultSummary.textContent = `${result.levelsChecked !== undefined ? `${result.levelsChecked} levels checked` : `${result.filesChecked} locale files checked`} · ${result.errors?.length || 0} errors · ${result.warnings?.length || 0} warnings`;
    if (issues.length === 0) addItem("pass", "PASS", "No issues found.");
    issues.forEach((issue) => addItem(issue.severity === "error" ? "error" : "warning", `${issue.severity.toUpperCase()} · ${issue.code}`, issue.message));
  }
  setState(result.ok ? "success" : "error", result.ok ? "COMPLETE" : "ATTENTION");
}

async function execute(endpoint, payload) {
  setState("loading", "RUNNING");
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed.");
    renderResult(result);
  } catch (error) {
    renderResult({ ok: false, errors: [{ severity: "error", code: "REQUEST_FAILED", message: error instanceof Error ? error.message : "Request failed." }], warnings: [], levelsChecked: 0 });
  }
}

tabs.forEach((tab) => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
document.querySelector('[data-action="lint"]').addEventListener("click", () => execute("/api/lint", { filePath: document.querySelector("#level-path").value }));
document.querySelector('[data-action="localization"]').addEventListener("click", () => execute("/api/localization", { locDirPath: document.querySelector("#locale-path").value, baseLang: document.querySelector("#base-language").value }));
document.querySelector('[data-action="eval"]').addEventListener("click", () => {
  try { execute("/api/evals", { taskType: evalType.value, generatedOutput: JSON.parse(generatedOutput.value) }); }
  catch { renderResult({ ok: false, errors: [{ severity: "error", code: "INVALID_JSON", message: "Generated JSON is not valid." }], warnings: [], levelsChecked: 0 }); }
});
document.querySelector('[data-action="unity-guard"]').addEventListener("click", () => execute("/api/unity-guard", { path: unityPath.value }));
document.querySelector('[data-action="skill-eval"]').addEventListener("click", () => execute("/api/skill-eval", {}));
document.querySelector('[data-action="load-bad-sample"]').addEventListener("click", () => { unityPath.value = "examples/BadPlayerController.cs"; });
document.querySelector('[data-action="load-clean-sample"]').addEventListener("click", () => { unityPath.value = "examples/CleanPlayerController.cs"; });
document.querySelector("#open-settings").addEventListener("click", () => settingsDialog.showModal());
function refreshMonitor() { execute("/api/agent-mon/list", {}); }
function stopMonitorRefresh() { if (monitorTimer) clearInterval(monitorTimer); monitorTimer = undefined; }
function startMonitorRefresh() { stopMonitorRefresh(); if (monitorLive.checked) monitorTimer = setInterval(refreshMonitor, Number(monitorInterval.value) * 1_000); }
document.querySelector('[data-action="monitor-list"]').addEventListener("click", refreshMonitor);
document.querySelector('[data-action="monitor-audit"]').addEventListener("click", () => execute("/api/agent-mon/audit", { logPath: monitorLogPath.value }));
monitorLive.addEventListener("change", () => { if (monitorLive.checked) { refreshMonitor(); startMonitorRefresh(); } else stopMonitorRefresh(); });
monitorInterval.addEventListener("change", startMonitorRefresh);
document.querySelector('[data-action="save-keys"]').addEventListener("click", () => {
  sessionStorage.setItem("game-ops-openai-key", openAiKey.value);
  sessionStorage.setItem("game-ops-anthropic-key", anthropicKey.value);
  renderResult({ ok: true, errors: [], warnings: [], levelsChecked: 0, message: "Credentials saved in this browser session only." });
  resultSummary.textContent = "Credentials saved for this browser session only. Current local tools do not use or transmit them.";
  settingsDialog.close();
});
evalType.addEventListener("change", () => { generatedOutput.value = JSON.stringify(evalType.value === "word_puzzle" ? wordPuzzleExample : notificationExample, null, 2); });

openAiKey.value = sessionStorage.getItem("game-ops-openai-key") || "";
anthropicKey.value = sessionStorage.getItem("game-ops-anthropic-key") || "";
