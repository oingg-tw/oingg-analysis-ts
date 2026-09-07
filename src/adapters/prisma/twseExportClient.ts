// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/twse-export-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';

// twse-ts 的 export schema——實體隔離的獨立 Neon 專案（跟主要的 twse 唯讀鏡像
// ../prisma/twseClient.ts 連的是完全不同的專案/憑證），只看得到 export schema（etl_reader
// role 限制，已實測驗證過連 public schema 都會被拒絕）。見 src/shared/sync/ 的說明。
// Prisma 7 driver adapter，見 ./index.ts 的說明（pgbouncer=true 那個坑）。
//
// **刻意固定連 PROD，不跟 sitca-ts/tpex-ts 一樣用 config.isProduction 動態切 DEV/PROD**：
// 2026-09-07 拿到 TWSE_EXPORT_DATABASE_URL_DEV 後試過改成動態切換，結果讓既有依賴
// daily_price 新鮮度的測試/功能全部連到落後 PROD 好幾天的 DEV 資料而壞掉（marketCap.test.ts
// 斷言的收盤日期對不上、twse/marketCap.test.ts 逾時）——DEV 資料目前比 PROD 更新頻率低、
// 覆蓋深度不一致（例如 monthly_revenue 在 DEV 有 5 年歷史但 PROD 幾乎是空的，daily_price
// 卻反過來是 PROD 比較新），不是「DEV 資料比較少但同步」這種單純落後關係，兩邊不能簡單
// 二選一。**要用 DEV 資料源（例如查 monthly_revenue 的歷史）時，另外開一個獨立連線
// （不要動這支 twseExportPrisma），等真的有具體功能要接 monthly_revenue 這類 DEV
// 專屬資料時再決定要不要做真正的 dev/prod 分離架構。**
const adapter = new PrismaPg({ connectionString: process.env.TWSE_EXPORT_DATABASE_URL });

export const twseExportPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectTwseExportDb = async () => {
  try {
    await twseExportPrisma.$connect();
    logger.info('[twse-export-db]: Connected to database.');
  } catch (error) {
    logger.error({ err: error }, '[twse-export-db]: Could not connect to the database.');
    throw error;
  }
};

export default twseExportPrisma;
