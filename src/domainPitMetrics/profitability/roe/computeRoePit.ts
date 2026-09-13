import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst, type BalanceSheetFields } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst, type IncomeStatementFields } from '@/shared/sourceData/incomeStatementXbrlFirst';
import type { QuarterlyKey } from '@/shared/sourceData/quarterlyKey';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

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
// 2026-09-13 依存反轉（DIP）示範：resolveRoeQuarterData 原本直接 import
// getBalanceSheetXbrlFirst/getIncomeStatementXbrlFirst 兩個具體函式，高層的 ROE 業務
// 邏輯直接依賴低層的「怎麼查 XBRL」細節。現在改成依賴 FinancialStatementPort 這個抽象
// 介面，XBRL 查詢函式變成實作這個介面的一個 adapter（xbrlFinancialStatementAdapter），
// 在呼叫端（第二個參數，預設值就是這個 adapter）注入——多數呼叫端不用改一行，因為
// TypeScript 的預設參數本來就是既有慣例（跟其餘 pitMetrics 檔案的 query 參數形狀一致），
// 只有想替換實作或測試時想塞假資料的呼叫端才需要明確傳第二個參數。這是全庫唯一一支
// 套用這個模式的檔案，其餘 116 支 compute*Pit.ts 刻意維持原本直接 import 的寫法——這裡
// 只是示範「如果要做，長什麼樣子」，還沒有全面鋪開的決定，見 2026-09-13 的討論。
export interface FinancialStatementPort {
  getIncomeStatement(key: QuarterlyKey): Promise<IncomeStatementFields | null>;
  getBalanceSheet(key: QuarterlyKey): Promise<BalanceSheetFields | null>;
}

export const xbrlFinancialStatementAdapter: FinancialStatementPort = {
  getIncomeStatement: getIncomeStatementXbrlFirst,
  getBalanceSheet: getBalanceSheetXbrlFirst,
};

interface PickedField {
  value: bigint | null;
  fieldKey: string | null;
}

const pickNetIncome = (record: IncomeStatementFields | null): PickedField => {
  if (!record) return { value: null, fieldKey: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent, fieldKey: 'profit_loss_attributable_to_owners_of_parent' };
  if (record.netIncome !== null) return { value: record.netIncome, fieldKey: 'profit_loss' };
  return { value: null, fieldKey: null };
};

const pickEquity = (record: BalanceSheetFields | null): PickedField => {
  if (!record) return { value: null, fieldKey: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent, fieldKey: 'equity_attributable_to_owners_of_parent' };
  if (record.totalEquity !== null) return { value: record.totalEquity, fieldKey: 'equity' };
  return { value: null, fieldKey: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——負權益仍然
// 算得出一個（可能扭曲的）實際數字，不算 null（跟 roe.ts 現有對外行為一致，這裡不改變語意）。
const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

export interface RoeQuarterResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  netIncome: PickedField;
  equity: PickedField;
  roeQuarterlyPct: number | null;
  roeQuarterlyAnnualizedPct: number | null;
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
  statements: FinancialStatementPort = xbrlFinancialStatementAdapter
): Promise<RoeQuarterResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, balanceSheet] = await Promise.all([statements.getIncomeStatement(key), statements.getBalanceSheet(key)]);

  const netIncome = pickNetIncome(incomeStatement);
  const equity = pickEquity(balanceSheet);

  const roeQuarterlyPct = netIncome.value !== null && equity.value !== null ? toPct(netIncome.value, equity.value) : null;
  const roeQuarterlyAnnualizedPct = roeQuarterlyPct !== null ? Math.round(roeQuarterlyPct * 4 * 100) / 100 : null;
  const quarterlyNullReason: MetricNullReason | null = roeQuarterlyPct === null ? determineNullReason(netIncome.value, equity.value) : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  // TTM：近四季（含本季）淨利加總 / 本季期末權益。四季資料需全部存在且淨利欄位皆非 null，
  // 否則視為不齊——不齊時寫一列 value=null/null_reason=insufficient_history，knowledge_date
  // 沿用本季（Q/Q_ANN）自己的 knowledge_date（本季資訊本身已知，只是 TTM 湊不齊）。
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

  const roeTtmPct = ttmComplete && equity.value !== null ? toPct(ttmSum, equity.value) : null;
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
    roeQuarterlyAnnualizedPct,
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

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface RoePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
  qAnn: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWriteRoePit = async (
  query: QuarterlyMetricQuery,
  statements: FinancialStatementPort = xbrlFinancialStatementAdapter
): Promise<RoePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolution = await resolveRoeQuarterData(query, statements);
  if (!resolution) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, qAnn: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { rocYear, season, fiscalYear, fiscalQuarter, roeQuarterlyPct, roeQuarterlyAnnualizedPct, quarterlyNullReason, mainAnchor, ttmComplete, roeTtmPct, ttmNullReason, ttmAnchor } =
    resolution;

  const coordinateBase = { symbol, metricCode: 'roe', fiscalYear, fiscalQuarter, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q'),
      value: roeQuarterlyPct,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    qAnn = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q_ANN'),
      value: roeQuarterlyAnnualizedPct,
      nullReason: quarterlyNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

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

  return { symbol, rocYear, season, q, qAnn, ttm };
};
