import { PrismaClient } from '#generated/playwright-export-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/infrastructure/config';
import { logger } from '@/infrastructure/logger';

// playwright-py 的 export schema——供應鏈分類資料同步用的唯讀連線，只看得到 export schema
// （etl_reader role 限制，見 prisma/playwrightExport/schema.prisma 的說明），跟其他
// export client（govExportPrisma/mopsExportPrisma/...）同一種模式，不要混用。
// Prisma 7 driver adapter，見 ./index.ts 的說明（pgbouncer=true 那個坑）。
const adapter = new PrismaPg({ connectionString: config.db.playwrightExport });

export const playwrightExportPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectPlaywrightExportDb = async () => {
  try {
    await playwrightExportPrisma.$connect();
    logger.info('[playwright-export-db]: Connected to database.');
  } catch (error) {
    logger.error({ err: error }, '[playwright-export-db]: Could not connect to the database.');
    throw error;
  }
};

export default playwrightExportPrisma;
