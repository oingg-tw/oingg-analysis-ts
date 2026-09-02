// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/gov-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';

// GOV DB：跟 mops/twse 一樣是唯讀鏡像，本服務不擁有這裡的表格 schema/migration。2026-08-30 從
// CBC 改名 GOV——資料來源本身沒變（還是央行統計資料庫的公債殖利率），純粹是重新命名。
// Prisma 7 driver adapter，見 ./index.ts 的說明（pgbouncer=true 那個坑）。
const adapter = new PrismaPg({ connectionString: process.env.GOV_DATABASE_URL });

export const govPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectGovDb = async () => {
  try {
    await govPrisma.$connect();
    console.log('[gov-db]: Connected to database.');
  } catch (error) {
    console.error('[gov-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default govPrisma;
