# Project Requirements Document: local-agent-monitor

## 1. Overview
`local-agent-monitor`, yerel geliştirici makinelerinde (Mac mini, MacBook, Linux VM) çalışan Claude Code, Cursor, Codex ve arka plan AI ajanlarını izleyen, kaynak tüketimlerini denetleyen ve kilitlenen (infinite-loop / runaway) süreçleri güvenli şekilde sonlandıran hafif bir altyapı monitörüdür.

## 2. Technical Stack
- Language: Node.js / TypeScript
- Interface: Terminal UI (TUI) via `blessed` / CLI daemon
- Metrics: PID, CPU %, Memory (MB), Execution Duration, Log Heartbeat
- Environment: macOS (Darwin) ve Linux (VM uyumlu)

## 3. Core Features
1. `Process Discovery`: Sistemde çalışan `claude`, `cursor`, `codex`, `node` veya `python` ajan süreçlerini isim ve PID ile otomatik filtreleme.
2. `Runaway Process Guard`: Belirlenen CPU/Süre sınırını (örn. 5 dakikadan uzun süre %90+ CPU tüketen kilitlenmiş ajanları) tespit edip uyarı verme veya güvenli kill (`SIGTERM` -> `SIGKILL`) sinyali gönderme.
3. `Heartbeat & Error Pattern Scanner`: Ajanların çıktı/log dizinlerini tarayarak "RateLimitError", "ContextWindowExceeded", "Connection refused" gibi hata örüntülerini (failure patterns) anlık raporlama.
4. `Status Dashboard / CLI`: Terminal üzerinden anlık izleme modu (`agent-mon top`) ve log özet modu (`agent-mon audit`).

## 4. Deliverables
- `src/scanner/`: İşlem ve kaynak tarayıcısı.
- `src/guard/`: Kilitlenme dedektörü ve süreç yönetimi.
- `src/cli.ts`: Terminal komutları (`top`, `audit`, `kill`).
- `README.md`: Mac mini / VM ortamlarında kurulum, systemd / launchd servis yapılandırma örnekleri.bu