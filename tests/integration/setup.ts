import 'dotenv/config';

// integration/flaky project 的 setup（vitest setupFiles，在每個測試檔案的 import 之前執行）：
// 整合測試會對 analysis DB 寫入/刪除資料列（例如 metricValueWriter 的併發測試、companies
// 的刪除+重算），2026-09-17 決定改打 analysis DB 的專用 Neon branch（ANALYSIS_DATABASE_URL_TEST），
// 不再直接寫開發資料庫——這裡在 analysisClient.ts 讀 process.env 之前把連線字串換掉。
// 其餘五個 export DB（mops/gov/twse/tpex/sitca）全部唯讀，維持用開發環境的連線
// （2026-09-20 playwright-py 供應鏈分類已完全移除）。
//
// 2026-09-17 使用者已建好 Neon branch（SIT，從 dev 分出來）：沒設 ANALYSIS_DATABASE_URL_TEST 直接 throw，
// 不再退回開發 DB——防止之後有人在沒設定的環境誤寫開發資料。
const testUrl = process.env.ANALYSIS_DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error('[tests/integration/setup] ANALYSIS_DATABASE_URL_TEST 未設定：整合測試只能打 analysis DB 的測試用 Neon branch，請在 .env 設定後再跑。');
}
process.env.ANALYSIS_DATABASE_URL = testUrl;
process.env.LOG_LEVEL ??= 'silent';
