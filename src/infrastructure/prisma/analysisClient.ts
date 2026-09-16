import { PrismaClient } from '#generated/analysis-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/infrastructure/config';
import { logger } from '@/infrastructure/logger';
import { upsertShadowExtension } from './upsertShadowExtension';

// oingg-analysis DB：本服務自己擁有 schema/migration，跟唯讀鏡像的 mops DB（見 ./index.ts）
// 是完全獨立的連線，不要混用。
// Prisma 7 driver adapter，見 ./index.ts 的說明（pgbouncer=true 那個坑）。連線字串由 config
// 統一驗證過（.env 也是在那裡載入，一定早於這裡的 PrismaPg 建構）。
const adapter = new PrismaPg({ connectionString: config.db.analysis });

const rawAnalysisPrisma = new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['info', 'warn', 'error'],
});

// P0 止血：所有 model 的 upsert 在覆蓋舊值前，先把舊值存進 metric_upsert_shadow，見
// ./upsertShadowExtension.ts。.$extends() 保留 $connect/$disconnect 等頂層方法，45 個
// 既有消費端（含所有測試檔案的 analysisPrisma.$disconnect()）不用改。
export const analysisPrisma = rawAnalysisPrisma.$extends(upsertShadowExtension);

export const connectAnalysisDb = async () => {
  try {
    await analysisPrisma.$connect();
    logger.info('[analysis-db]: Connected to database.');
  } catch (error) {
    logger.error({ err: error }, '[analysis-db]: Could not connect to the database.');
    throw error;
  }
};

