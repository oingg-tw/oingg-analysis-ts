import { PrismaClient } from '#generated/gov-client';
import { config } from '@/shared/config';

// GOV DB：跟 mops/twse 一樣是唯讀鏡像，本服務不擁有這裡的表格 schema/migration。2026-08-30 從
// CBC 改名 GOV——資料來源本身沒變（還是央行統計資料庫的公債殖利率），純粹是重新命名。
export const govPrisma = new PrismaClient({
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
