# oingg-analysis-ts

台股財務指標計算服務——從 oingg 生態系上游服務（mops-ts/twse-ts/tpex-ts/gov-ts/sitca-ts）
的公開揭露資料計算衍生財務指標（ROE、Altman Z-Score、估值倍數、產業分類瀏覽等），供
bff-ts 消費。命名慣例、跨服務對齊決策見 [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md)；
指標分類/公式/口徑見 [`src/domainMetrics/README.md`](src/domainMetrics/README.md)；
架構演進脈絡見 [`docs/analysis-ts-spec-v0.2.md`](docs/analysis-ts-spec-v0.2.md)（如果
`docs/` 還在——那個資料夾內容可能隨時被清掉，不保證持久）。

## 技術棧

- TypeScript + `tsx`（開發期直接跑 `.ts`，不用先編譯）
- `ultimate-express`（Express 相容 API）
- Prisma 7（driver adapter 架構，`@prisma/adapter-pg`）+ PostgreSQL（Neon）
- Zod + `@asteasolutions/zod-to-openapi`（request 驗證跟 OpenAPI 文件共用同一份 schema）
- `pino`（結構化 logging）
- vitest（測試，整合測試打真的開發資料庫，不 mock）
- husky + lint-staged（pre-commit 跑 `oxlint --type-aware`）

## 快速開始

```bash
pnpm install          # postinstall 會自動跑全部 6 個 schema 的 prisma generate
pnpm dev              # tsx watch src/index.ts，預設監聽 :5000
pnpm test             # vitest，會連真的開發資料庫
```

啟動後到 `http://localhost:5000/api-docs` 看 Swagger UI。對外端點（`src/api/bff/**`）
需要 `X-Api-Key` header（見下方「認證」），批次端點（`src/api/batch/**`）不需要。

## 資料庫：一個自己擁有 + 五個唯讀來源

跟很早期的設計不同（如果你在舊 commit 或文件裡看到「唯讀鏡像」、「跟 mops-ts 共用資料庫」
這類描述，那些已經不是現況）：本服務**自己擁有並管理**一個 Postgres 資料庫（Neon 專案
`oingg-analysis`，`prisma/analysis/schema.prisma`，唯一會跑 `pnpm prisma:analysis:migrate`
的 schema），存的是算完的指標結果；另外用 `etl_reader`（唯讀）角色連五個上游服務各自的
`export` schema 取得原始資料，**只讀，不落地存副本**（2026-09-03 起明確決定：curated
中台鏡像層現階段太早，一律即時查詢）：

| Schema | 上游服務 | 主要用途 |
|---|---|---|
| `prisma/mopsExport/schema.prisma` | mops-ts | 季度財報三大表（損益表/資產負債表/現金流量表）、股本歷史、財報公告日 |
| `prisma/twseExport/schema.prisma` | twse-ts | 個股/加權指數日成交、PER/PBR/殖利率、公司基本資料、產業代碼 |
| `prisma/tpexExport/schema.prisma` | tpex-ts | 上櫃版本的同類資料 |
| `prisma/govExport/schema.prisma` | gov-ts | 10 年期公債殖利率、財政部稅籍行業分類（`company_industry_classification`/`industry_codes`） |
| `prisma/sitcaExport/schema.prisma` | sitca-ts | 基金/ETF 資料（費用率、月申購贖回、ETF 基本資料） |

改動/重新內省各自的 `pnpm prisma:<name>:pull`/`:studio`；**只有 `analysis` 這份會跑
`migrate`**，其餘五份是別的服務擁有的 schema，本服務永遠不對它們做 migration。各自的
generator output 在 `generated/<name>-client/`（已 `.gitignore`，`postinstall` 統一產生）。

## 指標架構：兩套並存（strangler pattern 進行中）

1. **既有架構**（37 張「一指標一表」的結果表，見 `prisma/analysis/schema.prisma`）：
   `src/domainMetrics/*.ts` 每個檔案一支指標，算完 `upsert` 進對應表。對外透過
   `GET /companies/metrics`（consolidated 讀取優先端點，cache miss 才觸發現算）跟
   `POST /screener/values`（給定 symbol 清單查值）消費，批次全量重算走
   `src/api/batch/`（`daily`/`quarterly` 兩種頻率，GCP Cloud Scheduler 觸發）。
2. **Point-in-time 架構**（`src/pitMetrics/`，`metric_values`/`metric_definitions`
   通用事實表）：目前只有 ROE 一支指標當 spike 驗證過（`GET /companies/roe-history`），
   核心差異是帶 `knowledge_date`（該值最早可被市場知道的日期）版本化，支援之後的
   look-ahead-bias-free 回測——舊架構「就地覆蓋」做不到這件事。其餘 35 支指標尚未遷入，
   遷移路徑/決策見 `docs/analysis-ts-spec-v0.2.md`（如果還在）。
3. **P0 止血**（`src/adapters/prisma/upsertShadowExtension.ts`）：不管走哪套架構，
   所有 `upsert` 在真的覆蓋既有列之前，先把舊值存進 `metric_upsert_shadow`（全域套用，
   對 45 個既有消費端零改動）——這不是完整的 point-in-time 能力，純粹是防止財報重編
   靜靜銷毀歷史資料的保險。

指標分類（獲利能力/現金流/財務結構/周轉率/大師模型/估值）跟每支指標的計算公式/口徑，
見 [`src/domainMetrics/README.md`](src/domainMetrics/README.md)——這裡不重複維護一份
容易過期的清單。

`src/domainMacro/`（`equityRiskPremium`/`govBondYield10y`）是全市場單一值（不分公司）的
總體經濟指標，跟上面「每支證券一份數值」的 `domainMetrics` 是不同的資料形狀，回應直接
就是 HTTP 輸出本身，沒有中間的 filterCatalog/screener 那層。

## API 結構

```
src/api/bff/       給 bff-ts 呼叫，套用共用密鑰驗證（見下方「認證」）
  companies/       單一公司查詢：profile、capital-stock-history、metrics（consolidated）、
                   roe-history（point-in-time）、peer-group（產業同業比較）
  industries/      產業分類階層瀏覽（tree，財政部稅籍五層分類）
  screener/        多條件篩選 + 指定 symbol 清單批次查值
  filter/          可用 filter 分類/指標/欄位清單（GET /filters）
  market/          全市場排行榜（注意股/處置股/成交量/漲跌幅/月營收/ETF）
  metrics/         valuation ranking、macro（equityRiskPremium/govBondYield10y）
  stocks/          股價、除權息預告
src/api/batch/     給 GCP Cloud Scheduler 觸發，不套用 bff 密鑰（走 Cloud Run IAM）
  daily/           逐日型指標批次（beta、marketRatios）
  quarterly/       季度財報型指標批次（其餘）
```

路由掛載見 [`src/routes.ts`](src/routes.ts)；OpenAPI 文件註冊見
[`src/adapters/swagger/index.ts`](src/adapters/swagger/index.ts)——每個 `api/bff/**`
資料夾自己的 `openapi.ts` 負責註冊自己的路徑，這個檔案統一 import 並呼叫一次。

## 認證

`src/api/bff/**` 底下的路由套用共用密鑰驗證（`src/shared/bffAuth.ts`），呼叫端要帶
`X-Api-Key` header（`.env` 的 `BFF_API_KEY`）。`src/api/batch/**` 刻意不套用這把密鑰
（呼叫方是 Cloud Scheduler 不是 bff-ts，是不同的信任邊界，之後接 Cloud Run IAM invoker
權限）。正式環境沒設 `BFF_API_KEY` 會直接讓伺服器啟動失敗，不會悄悄退化成不驗證；本機
開發沒設這個變數時 `bffAuth` 會放行，方便本地測試。

## 部署

GCP Cloud Run，`Dockerfile`（`node:22-trixie-slim` 基底）——同一個映像檔同時給 Cloud Run
「服務」（常駐 HTTP API，預設 CMD）跟「工作」（排程觸發跑一次就結束，由 Job 資源覆寫指令）
兩種資源用，不是兩份獨立映像檔。Migration 只在 CI/手動執行，不在容器啟動時自動跑。健康
檢查路由用 `/`，不要用 `/healthz`——那是 GCP 保留路徑。

## 測試

`pnpm test`（vitest）。大多是打真的開發資料庫的整合測試，不 mock——見
[`tests/README.md`](tests/README.md) 的慣例。新增/修改指標時比照既有測試風格補一個，
用實測過的真實數字釘斷言，不是隨便編造的範例值。
