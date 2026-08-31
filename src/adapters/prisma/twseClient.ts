import { PrismaClient } from '../../../generated/twse-client';
import { config } from '@/shared/config';

// oingg-twse DB：跟 mops 一樣是唯讀鏡像，本服務不擁有這裡的表格 schema/migration。
export const twsePrisma = new PrismaClient({
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectTwseDb = async () => {
  try {
    await twsePrisma.$connect();
    console.log('[twse-db]: Connected to database.');
  } catch (error) {
    console.error('[twse-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default twsePrisma;
