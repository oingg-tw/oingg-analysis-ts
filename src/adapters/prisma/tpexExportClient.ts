import { PrismaClient } from '../../../generated/tpex-export-client';
import { config } from '@/shared/config';

// tpex-ts 的 export schema——跟 sitca 同一種模式（dev/prod 兩個獨立 Neon 專案，不是同一個
// 專案的 pooler/direct 兩種連線方式），本服務用 config.isProduction 動態選要連哪一個，不是
// 寫死一組。prisma/tpexExport/schema.prisma 的 datasource url 固定指到 _DEV，那個只給 CLI
// （db pull/generate）用，實際 runtime 連線一律走這裡的 datasources override。
const url = config.isProduction ? process.env.TPEX_EXPORT_DATABASE_URL_PROD : process.env.TPEX_EXPORT_DATABASE_URL_DEV;

export const tpexExportPrisma = new PrismaClient({
  datasources: { db: { url } },
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectTpexExportDb = async () => {
  try {
    await tpexExportPrisma.$connect();
    console.log(`[tpex-export-db]: Connected to database (${config.isProduction ? 'prod' : 'dev'}).`);
  } catch (error) {
    console.error('[tpex-export-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default tpexExportPrisma;
