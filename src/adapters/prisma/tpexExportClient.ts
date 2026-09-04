// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/tpex-export-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';

// tpex-ts 的 export schema——跟 sitca 同一種模式（dev/prod 兩個獨立 Neon 專案，不是同一個
// 專案的 pooler/direct 兩種連線方式），本服務用 config.isProduction 動態選要連哪一個，不是
// 寫死一組。prisma/tpexExport/schema.prisma 的 datasource 不放連線字串（Prisma 7 driver
// adapter，見 ./index.ts 的說明），CLI（db pull/generate）連線資訊在 prisma.config.ts；
// 實際 runtime 連線一律走這裡的 PrismaPg。
const url = config.isProduction ? process.env.TPEX_EXPORT_DATABASE_URL_PROD : process.env.TPEX_EXPORT_DATABASE_URL_DEV;
const adapter = new PrismaPg({ connectionString: url });

export const tpexExportPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectTpexExportDb = async () => {
  try {
    await tpexExportPrisma.$connect();
    logger.info(`[tpex-export-db]: Connected to database (${config.isProduction ? 'prod' : 'dev'}).`);
  } catch (error) {
    logger.error({ err: error }, '[tpex-export-db]: Could not connect to the database.');
    throw error;
  }
};

export default tpexExportPrisma;
