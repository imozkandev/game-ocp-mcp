# Project Requirements Document: skill-eval-ci

## 1. Overview
`skill-eval-ci`, kodlama ajanlarının ve sistem promptlarının (skills) geliştirilme sürecinde regresyonu önleyen açık kaynaklı bir CI değerlendirme (eval) hattıdır. Bir "skill" veya sistem promptu güncellendiğinde (Pull Request açıldığında), GitHub Actions üzerinde sıfır maliyetli deterministik eval testleri koşturur; önceki versiyon (baseline) ile yeni versiyonu karşılaştırıp PR altına detaylı bir doğrulama raporu ekler.

## 2. Technical Stack
- Environment: Node.js / TypeScript (CLI)
- Automation: GitHub Actions CI workflow
- Eval Method: Deterministik kural setleri, Zod şema doğrulaması, regex kontrolleri ve latency/token analizi (harici ücretli API gerektirmez)
- Output: Markdown formatında PR değerlendirme tablosu ve terminal raporu

## 3. Core Capabilities
1. `Dataset Runner`: `evals/datasets/` altındaki mock senaryoları (input promptları ve beklenen kriterleri) yürütme.
2. `Assertion Engine`: Ajanın ürettiği yanıtın format bütünlüğü (JSON geçerliliği), yasaklı kelime filtreleri, karakter sınırları ve beklenen anahtarların varlığını puanlama.
3. `Regression Benchmark`: Eski skill çıktısı (baseline) ile yeni skill çıktısını karşılaştırıp "Pass Rate: %80 -> %95 (+%15)" şeklinde delta skoru çıkarma.
4. `CI PR Reporter`: GitHub Actions ortamında PR'a otomatik özet yorumu bırakabilen Markdown çıktısı üretme.

## 4. Deliverables
- `src/engine/`: Test senaryolarını yürüten eval ve assertion motoru.
- `src/cli.ts`: `npm run eval -- --suite <path>` komutu.
- `.github/workflows/eval-regression.yml`: PR açıldığında otomatik koşan CI iş akışı.
- `skills/`: Örnek bir v1 (zayıf) ve v2 (iyileştirilmiş) oyun tasarımcısı/metin yazarı skill dosyası.
- `evals/`: 10 farklı test senaryosunu içeren dataset.
- `README.md`: Mülakat vaka çalışmasına referans veren, CI akışını açıklayan dökümantasyon.