import { logger } from '@/infrastructure/logger';
import { analysisPrisma, connectAnalysisDb } from '@/infrastructure/prisma/analysisClient';
import { mopsExportPrisma, connectMopsExportDb } from '@/infrastructure/prisma/mopsExportClient';
import { govExportPrisma, connectGovExportDb } from '@/infrastructure/prisma/govExportClient';
import { tpexExportPrisma, connectTpexExportDb } from '@/infrastructure/prisma/tpexExportClient';
import { sitcaExportPrisma, connectSitcaExportDb } from '@/infrastructure/prisma/sitcaExportClient';
import { twseExportPrisma, connectTwseExportDb } from '@/infrastructure/prisma/twseExportClient';

// 七個資料庫的連線/斷線集中在一處——順序跟抽出前的 src/index.ts 完全一樣（依序 await，
// 不是平行），純搬移不改行為。disconnectAllDbs 給測試 harness 跟腳本收尾用，讓 process
// 能自然結束（Prisma 連線池會撐住 event loop）。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類（合規考量：來源真實性/更新機制
// 不明，見 project_open_data_legal_audit_2026_09.md），第八個連線（playwrightExportPrisma）
// 已移除，連帶拿掉 GET /companies/peer-group、GET /industries/chain-{classification,clusters,tree}
// 三支端點與 IndustryReferenceDataPort 的供應鏈分類方法。
// 2026-10-06 冷啟動拆解：逐個記耗時（driver adapter 的 $connect 可能不真的開連線，第一個查詢才喚醒 Neon——記下來才分得出）。
const timed = async (label: string, connect: () => Promise<void>): Promise<void> => {
  const start = process.uptime();
  await connect();
  logger.info(`[startup] ${label} connect +${((process.uptime() - start) * 1000).toFixed(0)}ms`);
};

export const connectAllDbs = async (): Promise<void> => {
  await timed('analysis', connectAnalysisDb);
  await timed('mops', connectMopsExportDb);
  await timed('gov', connectGovExportDb);
  await timed('tpex', connectTpexExportDb);
  await timed('sitca', connectSitcaExportDb);
  await timed('twse', connectTwseExportDb);
};

export const disconnectAllDbs = async (): Promise<void> => {
  await Promise.allSettled([
    analysisPrisma.$disconnect(),
    mopsExportPrisma.$disconnect(),
    govExportPrisma.$disconnect(),
    tpexExportPrisma.$disconnect(),
    sitcaExportPrisma.$disconnect(),
    twseExportPrisma.$disconnect(),
  ]);
};
