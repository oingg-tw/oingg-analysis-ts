import { PrismaClient } from '@prisma/client';
import { config } from '@/shared/config';

// Instantiate a single PrismaClient instance to be used across the application.
// 本服務只讀（見 prisma/schema.prisma 開頭註解），永遠不對這些表跑 write/migrate。
export const prisma = new PrismaClient({
  // 開發模式下也不印 'query'——每支 query 都會印出完整 SQL，本地/測試輸出被灌爆，
  // 真的要看 SQL 再臨時改這裡，不要常態開著。
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

export const connectDb = async () => {
  try {
    await prisma.$connect();
    console.log('[db]: Connected to database.');
  } catch (error) {
    console.error('[db]: Could not connect to the database.', error);
    throw error; // Re-throw to be caught by the server starter and prevent server from starting.
  }
};

export default prisma;
