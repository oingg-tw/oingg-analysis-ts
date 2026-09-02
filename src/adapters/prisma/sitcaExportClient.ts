// 一定要在 import PrismaPg 之前先載入 .env，理由見 ./index.ts 開頭的說明（Prisma 5/6 的
// env() datasource 有內建自動載入 .env，driver adapter 沒有，要自己載）。
import 'dotenv/config';
import { PrismaClient } from '#generated/sitca-export-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/shared/config';

// sitca-ts 的 export schema——跟 mops/gov export 不同，sitca-ts 給的是 dev/prod 兩個獨立 Neon
// 專案（不是同一個專案的 pooler/direct 兩種連線方式），2026-09-01 使用者定調「dev 對 dev、
// prod 對 prod」：本服務用 config.isProduction 動態選要連哪一個，不是寫死一組。
// prisma/sitcaExport/schema.prisma 的 datasource 不放連線字串（Prisma 7 driver adapter，見
// ./index.ts 的說明），CLI（db pull/generate）連線資訊在 prisma.config.ts；實際 runtime
// 連線一律走這裡的 PrismaPg。
const url = config.isProduction ? process.env.SITCA_EXPORT_DATABASE_URL_PROD : process.env.SITCA_EXPORT_DATABASE_URL_DEV;
const adapter = new PrismaPg({ connectionString: url });

export const sitcaExportPrisma = new PrismaClient({
  adapter,
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
