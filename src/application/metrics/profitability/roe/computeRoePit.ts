import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickEquityWithFieldKey as pickEquity, pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { financialDataAdapter, type IncomeStatementPort, type BalanceSheetPort } from '@/application/metrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';

import { writeOrSkip, writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';

// 這份檔案是 src/domainMetrics/roe.ts 的獨立重新實作，刻意不 import 它的（未 export 的）
// 私有函式，也不呼叫 calculateRoe() 本身——保持這條新管線對舊系統完全唯讀，不會觸發
// profitability_roe 的 upsert 副作用。兩份實作理論上算出相同數字，tests/domainPitMetrics/roePit.test.ts
// 拿 roe.test.ts 的既有基準數字交叉驗證，能抓到任一份實作的 bug，不是同一份邏輯繞一圈。
//
// 2026-09-10：抽出 resolveRoeQuarterData()，回傳原始欄位（附帶實際命中哪個 fieldKey）+
// 完整計算過程，給 getRoeProvenance.ts（GET /companies/:symbol/metric-provenance 的
// roe 試點）共用，寫入路徑（computeAndWriteRoePit）本身行為完全不變，只是內部改呼叫這個
// resolver。2026-09-11：舊三大表已退役，PickedField 不再需要追蹤資料源（永遠是 XBRL）。
//
// 2026-09-13 依存反轉（DIP）：resolveRoeQuarterData 原本直接 import
// getBalanceSheetXbrlFirst/getIncomeStatementXbrlFirst 兩個具體函式，高層的 ROE 業務
// 邏輯直接依賴低層的「怎麼查 XBRL」細節。現在改成依賴 shared/ports/financialDataPorts.ts
// 的 IncomeStatementPort & BalanceSheetPort 抽象介面（這是全庫共用的 Port 定義，不是
// 這支檔案自己重新定義一份），在呼叫端（第二個參數，預設值是 financialDataAdapter）
// 注入——全部既有呼叫端一行都不用改。此模式已鋪開到全部 87 支 compute*Pit.ts，見
// shared/ports/financialDataPorts.ts 的說明。

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——負權益仍然
// 算得出一個（可能扭曲的）實際數字，不算 null（跟 roe.ts 現有對外行為一致，這裡不改變語意）。
export interface RoeQuarterResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  netIncome: PickedField;
  equity: PickedField;
  roeQuarterlyPct: number | null;
  quarterlyNullReason: MetricNullReason | null;
  mainAnchor: KnowledgeDateResolution | null;
  ttmQuarters: { year: string; season: string }[];
  ttmNetIncomes: PickedField[];
  ttmComplete: boolean;
  ttmSum: bigint;
  roeTtmPct: number | null;
  ttmNullReason: MetricNullReason | null;
  ttmAnchor: KnowledgeDateResolution | null;
}

export const resolveRoeQuarterData = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & BalanceSheetPort = financialDataAdapter
): Promise<RoeQuarterResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, balanceSheet] = await Promise.all([statements.getIncomeStatement(key), statements.getBalanceSheet(key)]);

  const netIncome = pickNetIncome(incomeStatement);
  const equity = pickEquity(balanceSheet);

  const roeQuarterlyPct = netIncome.value !== null && equity.value !== null ? toPercent(netIncome.value, equity.value) : null;
  const quarterlyNullReason: MetricNullReason | null = roeQuarterlyPct === null ? determineNullReason(netIncome.value, equity.value) : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  // TTM：近四季（含本季）淨利加總 / 本季期末權益。四季資料需全部存在且淨利欄位皆非 null，
  // 否則視為不齊——不齊時寫一列 value=null/null_reason=insufficient_history，knowledge_date
  // 沿用本季（Q）自己的 knowledge_date（本季資訊本身已知，只是 TTM 湊不齊）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const ttmNetIncomes = ttmRecords.map((record) => pickNetIncome(record));
  let ttmSum = 0n;
  let ttmComplete = true;
  for (const picked of ttmNetIncomes) {
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      ttmSum += picked.value;
    }
  }

  const roeTtmPct = ttmComplete && equity.value !== null ? toPercent(ttmSum, equity.value) : null;
  const ttmNullReason: MetricNullReason | null = roeTtmPct !== null ? null : ttmComplete ? determineNullReason(ttmSum, equity.value) : 'insufficient_history';

  const ttmAnchor = ttmComplete
    ? await resolveKnowledgeDate(
        symbol,
        ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
      )
    : null;

  return {
    symbol,
    rocYear: year,
    season,
    fiscalYear,
    fiscalQuarter: seasonNum,
    netIncome,
    equity,
    roeQuarterlyPct,
    quarterlyNullReason,
    mainAnchor,
    ttmQuarters,
    ttmNetIncomes,
    ttmComplete,
    ttmSum,
    roeTtmPct,
    ttmNullReason,
    ttmAnchor,
  };
};

export type RoePitOutcome = StandardBasisPitOutcome;

export const computeAndWriteRoePit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & BalanceSheetPort = financialDataAdapter
): Promise<RoePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolution = await resolveRoeQuarterData(query, statements);
  if (!resolution) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { rocYear, season, fiscalYear, fiscalQuarter, roeQuarterlyPct, quarterlyNullReason, mainAnchor, ttmComplete, roeTtmPct, ttmNullReason, ttmAnchor } = resolution;

  const coordinateBase = { symbol, metricCode: 'roe', fiscalYear, fiscalQuarter, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', roeQuarterlyPct, quarterlyNullReason);

  let ttm: BasisOutcome;
  if (ttmComplete) {
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: roeTtmPct,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear, season, q, ttm };
};
