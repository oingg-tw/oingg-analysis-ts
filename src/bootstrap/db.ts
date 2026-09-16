import { analysisPrisma, connectAnalysisDb } from '@/infrastructure/prisma/analysisClient';
import { mopsExportPrisma, connectMopsExportDb } from '@/infrastructure/prisma/mopsExportClient';
import { govExportPrisma, connectGovExportDb } from '@/infrastructure/prisma/govExportClient';
import { playwrightExportPrisma, connectPlaywrightExportDb } from '@/infrastructure/prisma/playwrightExportClient';
import { tpexExportPrisma, connectTpexExportDb } from '@/infrastructure/prisma/tpexExportClient';
import { sitcaExportPrisma, connectSitcaExportDb } from '@/infrastructure/prisma/sitcaExportClient';
import { twseExportPrisma, connectTwseExportDb } from '@/infrastructure/prisma/twseExportClient';
import { twseExportDevPrisma, connectTwseExportDevDb } from '@/infrastructure/prisma/twseExportDevClient';

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
