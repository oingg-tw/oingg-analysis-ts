// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/gov-export-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';

// gov-ts 的 export schema——數據中台同步用的唯讀連線，只看得到 export schema（etl_reader
// role 限制，gov-ts 實測驗證過連 INSERT/CREATE TABLE 都會被拒絕），跟主要的 gov 唯讀鏡像
// （../prisma/govClient.ts，連的是 public schema）是完全不同的連線/憑證，不要混用。
// 見 src/shared/sync/ 的說明。
// Prisma 7 driver adapter，見 ./index.ts 的說明（pgbouncer=true 那個坑）。
const adapter = new PrismaPg({ connectionString: process.env.GOV_EXPORT_DATABASE_URL });

export const govExportPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectGovExportDb = async () => {
  try {
    await govExportPrisma.$connect();
    console.log('[gov-export-db]: Connected to database.');
  } catch (error) {
    console.error('[gov-export-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default govExportPrisma;
