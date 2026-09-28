# Project Requirements Document: game-ops-mcp

## 1. Overview
`game-ops-mcp`, mobil oyun stüdyoları için tasarlanmış açık kaynaklı, yerel çalışan bir Model Context Protocol (MCP) sunucusudur. Claude Code, Codex ve Cursor gibi kodlama ajanlarının oyun denge tablolarını denetlemesini, lokalizasyon bütünlüğünü sağlamasını ve deterministik eval (değerlendirme) testleri koşturmasını sağlar.

## 2. Technical Stack
- Language: TypeScript (Node.js, ES2022, NodeNext)
- Protocol: Official `@modelcontextprotocol/sdk` (Stdio transport)
- Validation: Zod
- Environment: Zero external paid API dependencies; fully local execution

## 3. Core MCP Tools

### 3.1. `lint_level_balance`
- Input: `filePath` (string)
- Functionality:
  - JSON dosyasını okur, her seviyeyi Zod şeması ile doğrular (`levelId`, `targetScore`, `maxMoves`, `rewardCoins`).
  - Denge anomalilerini tespit eder: Sıfır ödül, imkansız hamle sınırları, seviyeler arası anormal hamle sıçramaları (spike detection).
  - Anlaşılır hata ve uyarı listesi döner.

### 3.2. `audit_localization`
- Input: `locDirPath` (string), `baseLang` (string, varsayılan: "en.json")
- Functionality:
  - Referans dil dosyası ile hedef dil dosyalarını (JSON) karşılaştırır.
  - Hedef dillerdeki eksik anahtarları (missing keys) bulur.
  - `{playerName}`, `{count}` gibi parametre uyumsuzluklarını ve kayıp placeholder'ları raporlar.

### 3.3. `run_agent_evals`
- Input: `taskType` ("word_puzzle" | "push_notification"), `generatedOutput` (object)
- Functionality:
  - Kodlama ajanı tarafından üretilen oyun içeriğini deterministik kural setleriyle test eder.
  - Word Puzzle: Şema bütünlüğü, ızgara (grid) sınırını aşan kelimeler, duplikasyon kontrolü.
  - Push Notification: Karakter sınırları (başlık <= 45, gövde <= 120), harekete geçirici mesaj (CTA) varlığı.
  - Çıktı: Başarı yüzdesi (`score`), test senaryo sonuçları ve başarısızlık nedenleri.

## 4. Deliverables
1. `src/` altında modüler araçlar ve stdio MCP sunucu başlangıç noktası (`index.ts`).
2. `examples/` altında mock veriler (`levels.json`, bozuk seviyeler, çoklu dilde `locales/`).
3. CLI üzerinden doğrudan eval koşturabilmek için bağımsız bir test betiği (`npm run test:eval`).
4. Claude Code / Cursor entegrasyon komutlarını ve ekran alıntılarını içeren `README.md`.