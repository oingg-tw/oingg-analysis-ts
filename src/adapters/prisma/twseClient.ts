// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/twse-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';

// oingg-twse DB：跟 mops 一樣是唯讀鏡像，本服務不擁有這裡的表格 schema/migration。
// Prisma 7 driver adapter，見 ./index.ts 的說明（pgbouncer=true 那個坑）。
const adapter = new PrismaPg({ connectionString: process.env.TWSE_DATABASE_URL });

export const twsePrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectTwseDb = async () => {
  try {
    await twsePrisma.$connect();
    console.log('[twse-db]: Connected to database.');
  } catch (error) {
    console.error('[twse-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default twsePrisma;
