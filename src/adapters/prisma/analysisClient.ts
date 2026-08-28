import { PrismaClient } from '../../../generated/analysis-client';
import { config } from '@/shared/config';

// oingg-analysis DB：本服務自己擁有 schema/migration，跟唯讀鏡像的 mops DB（見 ./index.ts）
// 是完全獨立的連線，不要混用。
export const analysisPrisma = new PrismaClient({
  log: config.isProduction ? ['error'] : ['query', 'info', 'warn', 'error'],
});

export const connectAnalysisDb = async () => {
  try {
    await analysisPrisma.$connect();
    console.log('[analysis-db]: Connected to database.');
  } catch (error) {
    console.error('[analysis-db]: Could not connect to the database.', error);
    throw error;
  }
};

export default analysisPrisma;
