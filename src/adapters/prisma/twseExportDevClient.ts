// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/twse-export-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';

// **這支只給月營收功能用，不是給既有 twseExportPrisma（固定連 PROD）換源或補充用**——
// 2026-09-07 拿到 twse-ts 的 TWSE_EXPORT_DATABASE_URL_DEV（host ep-damp-butterfly，
// 跟 PROD 的 ep-summer-surf 是不同 Neon 專案）後發現 `export.monthly_revenue` 只有
// DEV 有 2330 完整 5 年資料（2021-08~2026-07），PROD 這批目前是 0 筆/資料源本身品質
// 有問題（見 ../../shared/sourceData/monthlyRevenue.ts 的說明）。twse-ts 已確認這是
// 一次性手動回填（從 MOPS 舊制個股查詢頁逐月抓的），不是常態每日更新的管道，之後也不會
// 自動長出新月份或新公司——**固定連 DEV，不用 config.isProduction 切換**，因為這整個
// 連線本身就是「目前只有這個環境有這批資料」的權宜之計，跟執行環境是 prod 還是 dev
// 無關（prod 環境跑這個服務一樣要連到 twse-ts 的 DEV 資料庫才拿得到月營收，因為 PROD
// 沒有）。之後 twse-ts 真的把月營收做成正式 PROD 管道時，要重新評估要不要換回
// twseExportPrisma，屆時這支檔案可能整個廢棄。
const adapter = new PrismaPg({ connectionString: process.env.TWSE_EXPORT_DATABASE_URL_DEV });

export const twseExportDevPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectTwseExportDevDb = async () => {
  try {
    await twseExportDevPrisma.$connect();
    logger.info('[twse-export-dev-db]: Connected to database (monthly-revenue only).');
  } catch (error) {
    logger.error({ err: error }, '[twse-export-dev-db]: Could not connect to the database.');
    throw error;
  }
};

export default twseExportDevPrisma;
