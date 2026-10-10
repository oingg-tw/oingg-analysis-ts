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

// 2026-10-08 GET /health 用（bff-ts 要求：回報的是資料庫有沒有醒，不只是行程在不在）：analysis 資料庫跑一個最小查詢。
// 同一天加上每個上游 export 庫各一個代表 view（業務中台建議、使用者同意）：sitca／tpex／twse 當天各自把 view 改名、
// 不留舊名，我們一半的端點 500 了半天，SELECT 1 照樣回 ok。WHERE false 只做解析與權限檢查、不讀資料。
// ponytail: 一個庫只探一個 view，抓得到整批改名、權限被收、庫連不上，抓不到單一 view 被拆；要更細就把各 repository 用到的 view 全列進來。
const DB_PROBES: [name: string, probe: () => Promise<unknown>][] = [
  ['analysis', () => analysisPrisma.$queryRaw`SELECT 1`],
  ['mops', () => mopsExportPrisma.$queryRaw`SELECT 1 FROM "export"."quarterly_income_statement_xbrl" WHERE false`],
  ['gov', () => govExportPrisma.$queryRaw`SELECT 1 FROM "export"."v_quarterly_gdps" WHERE false`],
  ['tpex', () => tpexExportPrisma.$queryRaw`SELECT 1 FROM "export"."v_daily_prices" WHERE false`],
  ['twse', () => twseExportPrisma.$queryRaw`SELECT 1 FROM "export"."v_daily_prices" WHERE false`],
  ['sitca', () => sitcaExportPrisma.$queryRaw`SELECT 1 FROM "export"."v_etf_monthly_profiles" WHERE false`],
];

// 回傳查不到的庫名稱（空陣列 = 全部正常）。
export const pingDatabases = async (): Promise<string[]> => {
  const results = await Promise.allSettled(DB_PROBES.map(([, probe]) => probe()));
  return DB_PROBES.filter((_, i) => results[i]!.status === 'rejected').map(([name]) => name);
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
