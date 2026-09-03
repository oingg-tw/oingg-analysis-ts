// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/twse-export-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';

// twse-ts 的 export schema——實體隔離的獨立 Neon 專案（跟主要的 twse 唯讀鏡像
// ../prisma/twseClient.ts 連的是完全不同的專案/憑證），只看得到 export schema（etl_reader
// role 限制，已實測驗證過連 public schema 都會被拒絕）。見 src/shared/sync/ 的說明。
// Prisma 7 driver adapter，見 ./index.ts 的說明（pgbouncer=true 那個坑）。
const adapter = new PrismaPg({ connectionString: process.env.TWSE_EXPORT_DATABASE_URL });

export const twseExportPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectTwseExportDb = async () => {
  try {
    await twseExportPrisma.$connect();
    console.log('[twse-export-db]: Connected to database.');
  } catch (error) {
    console.error('[twse-export-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default twseExportPrisma;
