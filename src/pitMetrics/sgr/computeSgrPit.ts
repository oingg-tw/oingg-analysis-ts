import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案獨立重新實作 src/domainMetrics/sgr.ts——舊架構呼叫 calculateRoe()+
// calculateDividendPayoutRatio()，這裡不依賴 roe/dividendPayoutRatio 這兩個 metric_code
// 已寫入的值，自己重新查資產負債表/損益表/現金流量表、重新算 ROE TTM 跟配息率 TTM，
// 維持每條 pipeline 獨立的既有原則（跟 computeDupontFamilyPit.ts 不依賴已遷移的 roe
// 完全同一個判斷）。sgrTtm = ROE(TTM) x (1 - 配息率(TTM)/100)，只有 TTM 一種 basis。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { value: record.totalEquity };
  return { value: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface SgrPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteSgrPit = async (query: QuarterlyMetricQuery): Promise<SgrPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await getQuarterlyBalanceSheet(key);
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  // 近四季（含本季）淨利、股利發放各自加總——淨利同一份加總同時餵給 ROE TTM 跟配息率 TTM，
  // 股利發放缺漏視為 0（大多數季度本來就沒發放，只有淨利缺漏才讓該季不齊，跟
  // dividendPayoutRatio.ts 一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let netIncomeTtmSum = 0n;
  let dividendsPaidTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    const picked = pickNetIncome(incomeRecord);
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked.value;
      dividendsPaidTtmSum += cashFlowRecord?.dividendsPaid ?? 0n;
    }
  }

  const roeTtm = ttmComplete && equity.value !== null ? toPct(netIncomeTtmSum, equity.value) : null;
  const dividendsPaidAbs = dividendsPaidTtmSum < 0n ? -dividendsPaidTtmSum : dividendsPaidTtmSum;
  const payoutRatioTtm = ttmComplete && netIncomeTtmSum > 0n ? toPct(dividendsPaidAbs, netIncomeTtmSum) : null;

  const sgrTtm = roeTtm !== null && payoutRatioTtm !== null ? round2(roeTtm * (1 - payoutRatioTtm / 100)) : null;
  // 任一子計算因四季不齊而為 null 時回報 insufficient_history；子計算本身可算但值為 null
  // （例如權益缺漏、或配息率分母≤0）時回報 missing_input——不細分是哪個子計算的哪種缺漏，
  // 那些細節記在各自獨立算過一次的過程裡，這裡的 sgr 是組裝值，只回報一種原因。
  const sgrNullReason: MetricNullReason | null = sgrTtm !== null ? null : ttmComplete ? 'missing_input' : 'insufficient_history';

  const coordinateBase = { symbol, metricCode: 'sgr', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        basis: 'TTM',
        value: sgrTtm,
        nullReason: sgrNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, ttm };
};
