import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { govExportPrisma } from '@/adapters/prisma/govExportClient';
import type { IngestionRun, SourceConnector, SyncTarget } from './types';

const DATASET = 'company_industry_classification';

// gov company_industry_classification 的 curated dataset——財政部稅籍登記的官方逐公司行業分類
// （不是 MOEA 營業項目代碼反推的，那條路已確認不通）。2026-09-01 實測確認 gov-ts 的
// ingestion_runs 是整批同步（一次全部公司一個 run，999 列），跟 gov bond yield 同一種模式，
// 不是逐公司的 mops 模式——不需要 sourceKey，每次同步就是重新拉整份 view，冪等 upsert 天然
// 處理重複。
export interface GovCompanyIndustryClassificationRow {
  stockCode: string;
  taxId: string;
  industryCode: string;
  sourceIndustryName: string;
  sectionCode: string;
  divisionCode: string;
  groupCode: string;
  classCode: string;
  subclassCode: string;
  classificationNameZh: string;
}

export const govCompanyIndustryClassificationTarget: SyncTarget<GovCompanyIndustryClassificationRow> = {
  upsertRows: async (rows, run) => {
    for (const row of rows) {
      await analysisPrisma.curatedGovCompanyIndustryClassification.upsert({
        where: { stockCode: row.stockCode },
        create: { ...row, sourceRunId: run.runId, completedAt: run.completedAt },
        update: { ...row, sourceRunId: run.runId, completedAt: run.completedAt },
      });
    }
  },
};

interface RawCompanyIndustryClassificationRow {
  stock_code: string | null;
  tax_id: string | null;
  industry_code: string | null;
  source_industry_name: string | null;
  section_code: string | null;
  division_code: string | null;
  group_code: string | null;
  class_code: string | null;
  subclass_code: string | null;
  classification_name_zh: string | null;
}

export const govCompanyIndustryClassificationConnector: SourceConnector<GovCompanyIndustryClassificationRow> = {
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
    const rawRows = await govExportPrisma.$queryRaw<RawCompanyIndustryClassificationRow[]>`
      SELECT * FROM "export"."company_industry_classification"
    `;
    return rawRows
      .filter((row): row is RawCompanyIndustryClassificationRow & { stock_code: string } => row.stock_code !== null)
      .map((row) => ({
        stockCode: row.stock_code,
        taxId: row.tax_id ?? '',
        industryCode: row.industry_code ?? '',
        sourceIndustryName: row.source_industry_name ?? '',
        sectionCode: row.section_code ?? '',
        divisionCode: row.division_code ?? '',
        groupCode: row.group_code ?? '',
        classCode: row.class_code ?? '',
        subclassCode: row.subclass_code ?? '',
        classificationNameZh: row.classification_name_zh ?? '',
      }));
  },
};
