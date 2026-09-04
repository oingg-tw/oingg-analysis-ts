// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/analysis-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';

// oingg-analysis DB：本服務自己擁有 schema/migration，跟唯讀鏡像的 mops DB（見 ./index.ts）
// 是完全獨立的連線，不要混用。
// Prisma 7 driver adapter，見 ./index.ts 的說明（pgbouncer=true 那個坑）。
const adapter = new PrismaPg({ connectionString: process.env.ANALYSIS_DATABASE_URL });

export const analysisPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectAnalysisDb = async () => {
  try {
    await analysisPrisma.$connect();
    logger.info('[analysis-db]: Connected to database.');
  } catch (error) {
    logger.error({ err: error }, '[analysis-db]: Could not connect to the database.');
    throw error;
  }
};

export default analysisPrisma;
