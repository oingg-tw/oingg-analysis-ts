import { PrismaClient } from '#generated/sitca-export-client';
import { config } from '@/shared/config';

// sitca-ts 的 export schema——跟 mops/gov export 不同，sitca-ts 給的是 dev/prod 兩個獨立 Neon
// 專案（不是同一個專案的 pooler/direct 兩種連線方式），2026-09-01 使用者定調「dev 對 dev、
// prod 對 prod」：本服務用 config.isProduction 動態選要連哪一個，不是寫死一組。
// prisma/sitcaExport/schema.prisma 的 datasource url 固定指到 _DEV，那個只給 CLI（db pull/
// generate）用，實際 runtime 連線一律走這裡的 datasources override。
const url = config.isProduction ? process.env.SITCA_EXPORT_DATABASE_URL_PROD : process.env.SITCA_EXPORT_DATABASE_URL_DEV;

export const sitcaExportPrisma = new PrismaClient({
  datasources: { db: { url } },
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectSitcaExportDb = async () => {
  try {
    await sitcaExportPrisma.$connect();
    console.log(`[sitca-export-db]: Connected to database (${config.isProduction ? 'prod' : 'dev'}).`);
  } catch (error) {
    console.error('[sitca-export-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default sitcaExportPrisma;
