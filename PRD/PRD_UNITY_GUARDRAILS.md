# Project Requirements Document: unity-agent-guardrails

## 1. Overview
`unity-agent-guardrails`, Claude Code, Cursor ve Codex gibi kodlama ajanlarının Unity/C# kod tabanlarında performans krizleri (Garbage Collection tetiklemeleri, main-thread kilitlenmeleri) ve mimari bozulmalar üretmesini engelleyen açık kaynaklı bir linter ve pre-commit emniyet kemeridir (guardrail).

## 2. Technical Stack
- Language: TypeScript / Node.js (CLI tool)
- Target Files: `.cs` (Unity C# Scripts)
- Integration: Git pre-commit hooks, Claude Code custom skills (`SKILL.md`), `.cursorrules`
- Dependencies: Zero paid external APIs; AST/regex tabanlı kural motoru

## 3. Core Rules & Checks
1. `no-gc-in-update`: `Update()`, `LateUpdate()`, `FixedUpdate()` içerisinde `new`, string birleştirme (`+`), veya LINQ (`.Where()`, `.Select()`, `.ToList()`) kullanımı tespiti.
2. `no-getcomponent-in-update`: Frame bazlı döngüler içinde `GetComponent<T>()`, `Find()`, `FindObjectOfType()` çağrılarının yasaklanması.
3. `enforce-serializefield-encapsulation`: Public değişkenler yerine `[SerializeField] private` kullanımını zorunlu kılma.
4. `async-thread-safety`: Unity ana iş parçacığıyla uyumsuz `Task.Run` veya ham thread kullanımlarını uyarma.

## 4. Deliverables
- `src/engine/`: C# dosyalarını tarayan kural kontrol motoru.
- `src/cli.ts`: `npx unity-agent-guardrails lint <path>` komutu.
- `.claude/skills/unity-rules.md`: Claude Code'un bu kurallara baştan uymasını sağlayan prompt/skill şablonu.
- `examples/`: Hatalı (`BadPlayerController.cs`) ve düzeltilmiş (`CleanPlayerController.cs`) örnek kodlar.
- `README.md`: Terminal çıktıları, kural listesi ve kurulum talimatları.