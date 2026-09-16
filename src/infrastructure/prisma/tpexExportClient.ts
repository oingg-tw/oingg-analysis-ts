import { PrismaClient } from '#generated/tpex-export-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/infrastructure/config';
import { logger } from '@/infrastructure/logger';

// tpex-ts 的 export schema——跟 sitca 同一種模式（dev/prod 兩個獨立 Neon 專案，不是同一個
// 專案的 pooler/direct 兩種連線方式），依執行環境二選一（選擇邏輯在 config.ts，
// 這裡直接拿選好的 config.db.tpexExport）。prisma/tpexExport/schema.prisma 的 datasource 不放連線字串（Prisma 7 driver
// adapter，見 ./index.ts 的說明），CLI（db pull/generate）連線資訊在 prisma.config.ts；
// 實際 runtime 連線一律走這裡的 PrismaPg。
const adapter = new PrismaPg({ connectionString: config.db.tpexExport });

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

