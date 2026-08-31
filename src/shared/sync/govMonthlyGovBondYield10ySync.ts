import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { govExportPrisma } from '@/adapters/prisma/govExportClient';
import type { IngestionRun, SourceConnector, SyncTarget } from './types';

const DATASET = 'monthly_gov_bond_yield_10y';

// gov monthly_gov_bond_yield_10y 的 curated dataset——第二個接上的 pilot，跟 mops 的顆粒度
//完全不同：這裡沒有公司代號維度，2026-08-31 實測確認 gov-ts 的 ingestion_runs 是「一整個
// 歷史資料集一筆 run」（369 列），不是逐筆逐月。listNewRuns/fetchDatasetRows 不需要
// sourceKey——每次同步就是重新拉整份 view，冪等 upsert 天然處理重複。
export interface GovMonthlyGovBondYield10yRow {
  year: number;
  month: number;
  yieldRate: string; // Decimal 用字串傳遞，跟 Prisma Decimal 輸入慣例一致
}

export const govMonthlyGovBondYield10yTarget: SyncTarget<GovMonthlyGovBondYield10yRow> = {
  upsertRows: async (rows, run) => {
    for (const row of rows) {
      await analysisPrisma.curatedGovMonthlyGovBondYield10y.upsert({
        where: { year_month: { year: row.year, month: row.month } },
        create: { ...row, sourceRunId: run.runId, completedAt: run.completedAt },
        update: { ...row, sourceRunId: run.runId, completedAt: run.completedAt },
      });
    }
  },
};

interface RawMonthlyGovBondYield10yRow {
  year: number | null;
  month: number | null;
  yield_rate: unknown;
}

export const govMonthlyGovBondYield10yConnector: SourceConnector<GovMonthlyGovBondYield10yRow> = {
  listNewRuns: async (sinceWatermark) => {
    const runs = await govExportPrisma.ingestionRun.findMany({
      where: {
        dataset: DATASET,
        status: 'success',
        ...(sinceWatermark ? { completedAt: { gt: sinceWatermark } } : {}),
      },
      orderBy: { completedAt: 'asc' },
    });

    return runs.map(
      (run): IngestionRun => ({
        runId: run.runId.toString(),
        dataset: run.dataset,
        dataDate: run.dataDate.toISOString().slice(0, 10),
        completedAt: run.completedAt,
        rowCount: run.rowCount,
        sourceKey: null,
      })
    );
  },

  fetchDatasetRows: async () => {
    const rawRows = await govExportPrisma.$queryRaw<RawMonthlyGovBondYield10yRow[]>`
      SELECT * FROM "export"."monthly_gov_bond_yield_10y"
    `;
    return rawRows
      .filter((row): row is RawMonthlyGovBondYield10yRow & { year: number; month: number } => row.year !== null && row.month !== null)
      .map((row) => ({
        year: row.year,
        month: row.month,
        yieldRate: String(row.yield_rate),
      }));
  },
};
