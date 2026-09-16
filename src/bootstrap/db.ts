import { analysisPrisma, connectAnalysisDb } from '@/adapters/prisma/analysisClient';
import { mopsExportPrisma, connectMopsExportDb } from '@/adapters/prisma/mopsExportClient';
import { govExportPrisma, connectGovExportDb } from '@/adapters/prisma/govExportClient';
import { playwrightExportPrisma, connectPlaywrightExportDb } from '@/adapters/prisma/playwrightExportClient';
import { tpexExportPrisma, connectTpexExportDb } from '@/adapters/prisma/tpexExportClient';
import { sitcaExportPrisma, connectSitcaExportDb } from '@/adapters/prisma/sitcaExportClient';
import { twseExportPrisma, connectTwseExportDb } from '@/adapters/prisma/twseExportClient';
import { twseExportDevPrisma, connectTwseExportDevDb } from '@/adapters/prisma/twseExportDevClient';

// 八個資料庫的連線/斷線集中在一處——順序跟抽出前的 src/index.ts 完全一樣（依序 await，
// 不是平行），純搬移不改行為。disconnectAllDbs 給測試 harness 跟腳本收尾用，讓 process
// 能自然結束（Prisma 連線池會撐住 event loop）。
export const connectAllDbs = async (): Promise<void> => {
  await connectAnalysisDb();
  await connectMopsExportDb();
  await connectGovExportDb();
  await connectPlaywrightExportDb();
  await connectTpexExportDb();
  await connectSitcaExportDb();
  await connectTwseExportDb();
  await connectTwseExportDevDb();
};

export const disconnectAllDbs = async (): Promise<void> => {
  await Promise.allSettled([
    analysisPrisma.$disconnect(),
    mopsExportPrisma.$disconnect(),
    govExportPrisma.$disconnect(),
    playwrightExportPrisma.$disconnect(),
    tpexExportPrisma.$disconnect(),
    sitcaExportPrisma.$disconnect(),
    twseExportPrisma.$disconnect(),
    twseExportDevPrisma.$disconnect(),
  ]);
};
