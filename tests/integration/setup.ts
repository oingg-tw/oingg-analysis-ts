import 'dotenv/config';

// integration/flaky project 的 setup（vitest setupFiles，在每個測試檔案的 import 之前執行）：
// 整合測試會對 analysis DB 寫入/刪除資料列（例如 metricValueWriter 的併發測試、companies
// 的刪除+重算），2026-09-17 決定改打 analysis DB 的專用 Neon branch（ANALYSIS_DATABASE_URL_TEST），
// 不再直接寫開發資料庫——這裡在 analysisClient.ts 讀 process.env 之前把連線字串換掉。
// 其餘六個 export DB（mops/gov/twse/tpex/sitca/playwright）全部唯讀，維持用開發環境的連線。
//
// 過渡期（Neon branch 還沒建好時）退回開發 DB 並大聲警告，跟 Phase 0 之前的行為一樣；
// branch 建好、.env 加上 ANALYSIS_DATABASE_URL_TEST 之後要把這個 fallback 改成直接 throw，
// 防止之後有人在沒設定的環境誤寫開發資料。
const testUrl = process.env.ANALYSIS_DATABASE_URL_TEST;
if (testUrl) {
  process.env.ANALYSIS_DATABASE_URL = testUrl;
} else {
  console.warn('[tests/integration/setup] ANALYSIS_DATABASE_URL_TEST 未設定，整合測試將直接寫入開發用的 analysis DB——請建立 Neon branch 並設定這個變數。');
}
process.env.LOG_LEVEL ??= 'silent';
