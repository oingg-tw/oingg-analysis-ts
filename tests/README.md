# tests/

用 Node.js 內建的 test runner（`node:test` + `node:assert/strict`），透過 `tsx --test` 直接跑 `.ts`，不需要額外安裝 vitest/jest 這類框架，跟本服務其他地方盡量少依賴的風格一致。

```bash
pnpm test          # 跑全部測試
pnpm test:types    # 只型別檢查 tests/（不影響 pnpm build 用的主 tsconfig.json 的 rootDir 設定）
```

## 這裡的測試大多是「打真的開發資料庫」的整合測試，不是單元測試

本服務每支 service.ts 本來就直接查 `.env` 指到的開發資料庫（`DATABASE_URL`/`ANALYSIS_DATABASE_URL`/`TWSE_DATABASE_URL`），程式碼裡完全沒有 mock 資料庫這件事——各分類 README 裡「已用台積電（2330）115Q2 實測驗證：xxx」那些段落，就是目前唯一的驗證紀錄方式，只存在文件裡、每次要重驗證都得手動重跑一次查詢。

`tests/domains/**` 就是把這些手動驗證過的數字釘死下來，跑真的 DB、斷言真的回傳值（例如 [`tests/domains/guru/ncav.test.ts`](domains/guru/ncav.test.ts) 斷言 2330 115Q2 NCAV = 64.19，對應 [`../src/domains/guru/README.md`](../src/domains/guru/README.md) 記錄的那次實測）——之後改到共用邏輯（例如 `rocQuarter.ts`、`capitalStock.ts`）不小心動到別的指標時，這些測試能立刻抓到，不用每次都重新手動 curl 一輪。

**這些測試需要 `.env` 裡的三個 DB 連線都能連得到**，跟跑 `pnpm dev` 的前提一樣；CI 如果要跑這些測試，需要準備對應的開發資料庫連線。

`tests/system/filterCatalogCheck.test.ts` 是例外——純邏輯比對，不連資料庫，餵假的 catalog/schema 字串進去測，跑起來很快，可以當一般單元測試用。

## 慣例

- 檔案路徑對應 `src/domains` 結構：`tests/domains/<category>/<metric>.test.ts` 對應 `src/domains/<category>/<metric>/`。
- 每個測試檔案結束前用 `after()` 呼叫用到的 Prisma client 的 `$disconnect()`，不然 process 不會自然結束。
- 斷言的數字如果來自實測，註解註明是哪家公司、哪一季，方便之後對照 README 或重新驗證。
