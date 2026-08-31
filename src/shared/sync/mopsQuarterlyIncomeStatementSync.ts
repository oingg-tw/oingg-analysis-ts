import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import type { IngestionRun, SourceConnector, SyncTarget } from './types';

// mops quarterly_income_statement 的 pilot dataset——業務欄位比照 mops-ts 的
// export.quarterly_income_statement view（2026-08-31 用 information_schema 實測過的真實欄位，
// 不是原本雛形假設的形狀，兩者幾乎一致但這是以真實 view 為準）。這個型別是 analysis-ts 自己
// 定義、自己擁有的，不直接重匯出 Prisma 產生的型別——這正是防腐層要達成的效果：mops-ts 那邊
// view 欄位改名，只需要改這個檔案裡的 mapping，不會直接波及呼叫端。
export interface MopsQuarterlyIncomeStatementRow {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
  reportDate: Date;
  operatingRevenue: bigint | null;
  grossProfit: bigint | null;
  operatingIncome: bigint | null;
  profitBeforeTax: bigint | null;
  netIncome: bigint | null;
  eps: string | null; // Decimal 用字串傳遞，跟 Prisma Decimal 輸入慣例一致
  adminExpenses: bigint | null;
  comprehensiveIncomeAttributableToNci: bigint | null;
  comprehensiveIncomeAttributableToParent: bigint | null;
  epsDiluted: string | null;
  financeCosts: bigint | null;
  grossProfitBeforeAdjustment: bigint | null;
  incomeTaxExpense: bigint | null;
  interestIncome: bigint | null;
  netIncomeAttributableToNci: bigint | null;
  netIncomeAttributableToParent: bigint | null;
  netIncomeFromContinuingOps: bigint | null;
  nonOperatingIncomeExpenses: bigint | null;
  operatingCost: bigint | null;
  operatingExpenses: bigint | null;
  otherComprehensiveIncome: bigint | null;
  otherIncome: bigint | null;
  otherNonOperatingGainsLosses: bigint | null;
  otherOperatingGainsLosses: bigint | null;
  rdExpenses: bigint | null;
  sellingExpenses: bigint | null;
  shareOfAssociatesJvProfit: bigint | null;
  totalComprehensiveIncome: bigint | null;
}

// 冪等 upsert：key 是 symbol + year + quarter + dataType + subsidiaryCompanyId（跟
// curated_mops_quarterly_income_statement 的 @@id 一致），重跑同一批次不會產生重複列。
export const mopsQuarterlyIncomeStatementTarget: SyncTarget<MopsQuarterlyIncomeStatementRow> = {
  upsertRows: async (rows, run) => {
    for (const row of rows) {
      const key = {
        symbol: row.symbol,
        year: row.year,
        quarter: row.quarter,
        dataType: row.dataType,
        subsidiaryCompanyId: row.subsidiaryCompanyId,
      };
      await analysisPrisma.curatedMopsQuarterlyIncomeStatement.upsert({
        where: { symbol_year_quarter_dataType_subsidiaryCompanyId: key },
        create: { ...row, sourceRunId: run.runId, completedAt: run.completedAt },
        update: { ...row, sourceRunId: run.runId, completedAt: run.completedAt },
      });
    }
  },
};

const DATASET = 'quarterly_income_statement';

// mops-ts 的 ingestion_runs 顆粒度是「一個 dataset、一家公司、一季」（2026-08-31 實測確認，
// 不是涵蓋多家公司的日批次），listNewRuns 塞進 sourceKey 給 fetchDatasetRows 用來重新查對應
// view 的列——這個形狀只有這個檔案自己看得懂，syncDataset 主邏輯不解讀。
interface MopsIngestionRunSourceKey {
  companyId: string;
  year: number;
  season: number;
}

// 對應 export.quarterly_income_statement 的原始欄位（snake_case），只在這個檔案內部使用，
// 拿到之後立刻透過 mapRawRow 轉成上面 analysis-ts 自己的型別，不會外流。
interface RawQuarterlyIncomeStatementRow {
  symbol: string | null;
  year: number | null;
  quarter: number | null;
  data_type: string | null;
  subsidiary_company_id: string | null;
  report_date: Date | null;
  operating_revenue: bigint | null;
  operating_cost: bigint | null;
  gross_profit_before_adjustment: bigint | null;
  gross_profit: bigint | null;
  selling_expenses: bigint | null;
  admin_expenses: bigint | null;
  rd_expenses: bigint | null;
  operating_expenses: bigint | null;
  other_operating_gains_losses: bigint | null;
  operating_income: bigint | null;
  interest_income: bigint | null;
  other_income: bigint | null;
  other_non_operating_gains_losses: bigint | null;
  finance_costs: bigint | null;
  share_of_associates_jv_profit: bigint | null;
  non_operating_income_expenses: bigint | null;
  profit_before_tax: bigint | null;
  income_tax_expense: bigint | null;
  net_income_from_continuing_ops: bigint | null;
  net_income: bigint | null;
  other_comprehensive_income: bigint | null;
  total_comprehensive_income: bigint | null;
  net_income_attributable_to_parent: bigint | null;
  net_income_attributable_to_nci: bigint | null;
  comprehensive_income_attributable_to_parent: bigint | null;
  comprehensive_income_attributable_to_nci: bigint | null;
  eps: unknown;
  eps_diluted: unknown;
}

const toDecimalString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const mapRawRow = (row: RawQuarterlyIncomeStatementRow): MopsQuarterlyIncomeStatementRow => ({
  symbol: row.symbol!,
  year: row.year!,
  quarter: row.quarter!,
  dataType: row.data_type!,
  subsidiaryCompanyId: row.subsidiary_company_id ?? '',
  reportDate: row.report_date!,
  operatingRevenue: row.operating_revenue,
  grossProfit: row.gross_profit,
  operatingIncome: row.operating_income,
  profitBeforeTax: row.profit_before_tax,
  netIncome: row.net_income,
  eps: toDecimalString(row.eps),
  adminExpenses: row.admin_expenses,
  comprehensiveIncomeAttributableToNci: row.comprehensive_income_attributable_to_nci,
  comprehensiveIncomeAttributableToParent: row.comprehensive_income_attributable_to_parent,
  epsDiluted: toDecimalString(row.eps_diluted),
  financeCosts: row.finance_costs,
  grossProfitBeforeAdjustment: row.gross_profit_before_adjustment,
  incomeTaxExpense: row.income_tax_expense,
  interestIncome: row.interest_income,
  netIncomeAttributableToNci: row.net_income_attributable_to_nci,
  netIncomeAttributableToParent: row.net_income_attributable_to_parent,
  netIncomeFromContinuingOps: row.net_income_from_continuing_ops,
  nonOperatingIncomeExpenses: row.non_operating_income_expenses,
  operatingCost: row.operating_cost,
  operatingExpenses: row.operating_expenses,
  otherComprehensiveIncome: row.other_comprehensive_income,
  otherIncome: row.other_income,
  otherNonOperatingGainsLosses: row.other_non_operating_gains_losses,
  otherOperatingGainsLosses: row.other_operating_gains_losses,
  rdExpenses: row.rd_expenses,
  sellingExpenses: row.selling_expenses,
  shareOfAssociatesJvProfit: row.share_of_associates_jv_profit,
  totalComprehensiveIncome: row.total_comprehensive_income,
});

export const mopsQuarterlyIncomeStatementConnector: SourceConnector<MopsQuarterlyIncomeStatementRow> = {
  listNewRuns: async (sinceWatermark) => {
    const runs = await mopsExportPrisma.ingestionRun.findMany({
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
        sourceKey: { companyId: run.companyId, year: run.year, season: run.season } satisfies MopsIngestionRunSourceKey,
      })
    );
  },

  fetchDatasetRows: async (run) => {
    const { companyId, year, season } = run.sourceKey as MopsIngestionRunSourceKey;
    const rawRows = await mopsExportPrisma.$queryRaw<RawQuarterlyIncomeStatementRow[]>`
      SELECT * FROM "export"."quarterly_income_statement"
      WHERE symbol = ${companyId} AND year = ${year} AND quarter = ${season}
    `;
    return rawRows.map(mapRawRow);
  },
};
