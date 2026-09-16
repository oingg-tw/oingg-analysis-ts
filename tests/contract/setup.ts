import 'dotenv/config';

// contract project 的 setup（vitest setupFiles，在每個測試檔案的 import 之前執行）：
// - BFF_API_KEY 固定成 'test-key'：bffAuth.ts 在沒設密鑰時會直接放行，契約測試要能同時
//   釘住「帶對密鑰 → 200」跟「不帶 → 401 精確 body」兩種行為，所以一定要有一把已知的密鑰。
//   golden 測試的請求全部帶 `X-Api-Key: test-key`。
// - LOG_LEVEL=silent：supertest 打進來的每個請求都會被 pino-http 記錄，測試輸出會被洗版；
//   config.ts/logger.ts 讀這個變數（見 src/shared/config.ts 的 logLevel 說明）。
// 這兩個值必須在 src/shared/config.ts 被 import 之前設好——config 是在 module 載入時讀
// process.env，setupFiles 剛好就是這個時機。
process.env.BFF_API_KEY = 'test-key';
process.env.LOG_LEVEL = 'silent';
