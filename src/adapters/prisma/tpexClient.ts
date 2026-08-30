import { PrismaClient } from '../../../generated/tpex-client';
import { config } from '@/shared/config';

// oingg-tpex DB：跟 mops/twse 一樣是唯讀鏡像，本服務不擁有這裡的表格 schema/migration。
export const tpexPrisma = new PrismaClient({
  log: config.isProduction ? ['error'] : ['query', 'info', 'warn', 'error'],
});

export const connectTpexDb = async () => {
  try {
    await tpexPrisma.$connect();
    console.log('[tpex-db]: Connected to database.');
  } catch (error) {
    console.error('[tpex-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default tpexPrisma;
