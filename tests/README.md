# tests/

測試框架是 **vitest**（`vitest.config.ts`），2026-09-17 clean architecture 重構 Phase 0 起拆成四個 project：

| project | 位置 | 需要 DB | 平行 | 用途 |
|---|---|---|---|---|
| `unit` | `tests/unit/**` | 不需要 | 是 | 純單元測試：domain 純函式、application use case 搭配 `tests/fakes/` 的記憶體 port 實作。Phase 5 之前還是空的。 |
| `contract` | `tests/contract/**` | `.env` 的 DB（唯讀） | 否 | **對外契約守門**：`openapi.test.ts` 把 `/api-docs` 的 OpenAPI 文件 deep key-sort 後跟 `openapi.snapshot.json` 逐字比對；`http/goldens.test.ts` 對 bff-ts 實際消費的 45 支端點各打一次，把 `{status, body 形狀}` 釘進 `http/__snapshots__/goldens/`。 |
| `integration` | `tests/integration/**` + 舊資料夾 `tests/{pitMetrics,models,domains,api,adapters,shared,twse}/**`（Phase 5 搬完前） | analysis 用 **Neon branch**（見下），其餘 export DB 用 `.env` | 否 | 打真實資料庫的整合測試：repository 契約、釘真實財報數字的指標測試、writer 併發。 |
| `flaky` | `tests/**/*.flaky.test.ts` | 同 integration | 否，retry 2 | 隔離區，見下方政策。 |

```bash
pnpm test               # unit + contract（日常開發、pre-push hook 跑這個）
pnpm test:unit
pnpm test:contract
pnpm test:contract:update   # 刻意的 API 變更：更新 snapshot，diff 跟路由變更放同一個 commit 審閱並通知 bff-ts
pnpm test:integration   # phase 收尾/大改動後跑（~2 分鐘起跳）
pnpm test:flaky
pnpm test:all           # 四個 project 全跑
pnpm typecheck          # src + tests + scripts 三份 tsconfig 都過型別檢查
```

## 契約測試（contract）的規則

- **重構期間對外契約一個 byte 都不能變**——任何一個 commit 讓 `openapi.snapshot.json` 或任何一個 golden 變了，就是契約變了。不是刻意的就修程式碼，不是修 snapshot。
- golden 釘的是**形狀**不是數值（`http/shape.ts`）：數字→`<number>`、日期→`<date>`、純數字字串→`<numeric-string>`、中文/自由文字→`<string>`、短 ASCII 識別字（`roe.TTM`、`3Y_1W`、`not_classified`）原樣保留、陣列只留第一個元素、物件 key 排序。nullable 欄位仍可能隨上游資料 null↔number 翻轉，遇到就人工判斷後 `-u`；nullability 本身由 OpenAPI snapshot 釘住。
- 輸入固定用 2330（歷史資料最完整），`BFF_API_KEY` 由 `contract/setup.ts` 固定成 `test-key`，`LOG_LEVEL=silent`。
- 刻意不打 `POST /batch/compute/*`：那支會同步跑整批計算（真實副作用）且每小時限 5 次。
- 依賴啟動快取的端點（peer-group、industries/*）由 `http/harness.ts` 先 `await warmCaches()` 再打。

## 整合測試（integration）的資料庫

整合測試會對 analysis DB **寫入/刪除**資料列（例如 `metricValueWriterConcurrency`、`completenessCheck` 會刪 2801 的列再重算），2026-09-17 決定改打 analysis DB 的專用 **Neon branch**：在 `.env` 設 `ANALYSIS_DATABASE_URL_TEST`，`tests/integration/setup.ts` 會在 Prisma client 讀取之前把 `ANALYSIS_DATABASE_URL` 換掉。其餘六個 export DB（mops/gov/twse/tpex/sitca/playwright）全部唯讀，維持用開發環境的連線。
過渡期沒設 `ANALYSIS_DATABASE_URL_TEST` 會退回開發 DB 並大聲警告；branch 建好之後要把那個 fallback 改成直接 throw。

`vitest.config.ts` 對 integration 關掉檔案間平行化（`fileParallelism: false`）——多支測試會操作同一批資料列；Phase 5 測試改用唯一 symbol 之後可以打開。

## 慣例

- 每個測試檔案結束前用 `afterAll()` 呼叫用到的 Prisma client 的 `$disconnect()`，不然 process 不會自然結束。
- 斷言的數字如果來自實測，註解註明是哪家公司、哪一季，方便之後對照或重新驗證。
- **不要拿「目前哪家公司財報進度落後」這種會隨資料庫累積而改變的狀態寫死成斷言**（2026-08-28 踩過一次：測試「公司 2887 資產負債表到 115Q1、損益表卡在 114Q2」這個交集案例時，把 `114`/`2` 寫死進斷言，結果 mops 隔天把 2887 損益表補到 115Q1，8 個測試檔案一起變紅）。正確做法：用 `getLatestAvailableQuarter` 對同一組 `sources` 現查現算出期望值，斷言服務回傳的季度等於這個現查的結果，而不是寫死某一天觀察到的數字。同一個原則也適用於 playwright-py 這類持續演進的資料源：不要斷言精確的聚落數/分類數/某家公司的分類，改成跟資料源當下現查的結果比對，或只斷言結構性質。
- Phase 5 起的單元測試：一個 port 一個 fake（`tests/fakes/inMemory<PortName>.ts`），`tests/fakes/createTestDeps.ts` 用空 fake 填滿整份 `AppDeps`，測試只覆寫自己需要的 port；fake 只實作 port 介面、永不碰 Prisma 型別（dependency-cruiser 的 `unit-tests-no-io` 規則強制）。真實財報數字的測試輸入用 `scripts/captureTestFixtures.ts` 擷取到 `tests/fixtures/`，讓既有的 golden 數字變成確定性斷言。

## flaky 政策

會間歇失敗的測試改名成 `*.flaky.test.ts`，檔頭註明**原因**跟**到期日**，從 `test:integration` 排除、改由 `test:flaky` 跑（retry 2 次）；兩週內修好搬回去或刪除，不能無限期隔離。目前已知：`tests/pitMetrics/metricValueWriterConcurrency.test.ts`（共用 ZZTEST9999 這個 symbol，應改成每次執行唯一 symbol + afterAll 清理）、`tests/domains/screener/service.test.ts`（排序穩定性）、`tests/twse/marketCap.test.ts`（上游 ingest 時機）。
