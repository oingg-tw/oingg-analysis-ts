import { PrismaClient } from '../../../generated/cbc-client';
import { config } from '@/shared/config';

// CBC（中央銀行統計資料庫）DB：跟 mops/twse 一樣是唯讀鏡像，本服務不擁有這裡的表格 schema/migration。
export const cbcPrisma = new PrismaClient({
  log: config.isProduction ? ['error'] : ['query', 'info', 'warn', 'error'],
});

export const connectCbcDb = async () => {
  try {
    await cbcPrisma.$connect();
    console.log('[cbc-db]: Connected to database.');
  } catch (error) {
    console.error('[cbc-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default cbcPrisma;
