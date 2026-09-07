import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getStockPriceAsOf } from '@/shared/sourceData/marketCap';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 本益比（PE）= 股價(knowledge_date) / EPS(TTM，近四季淨利加總/流通股數)。獨立重新實作，
// 不呼叫 computeEpsPit——分子分母的計算邏輯直接複製自 eps/computeEpsPit.ts 的 TTM 那段，
// 保持每支 PIT 檔案獨立、不互相依賴的既有原則。只有 TTM 一種 basis：台股慣例的「本益比」
// 就是用近四季 EPS，不像 psr/pFcf 那樣需要 Q_ANN 版本。
//
// 股價直接複用 resolveKnowledgeDate 算出來的 knowledge_date 去查 getStockPriceAsOf，
// 是 fcfYield/psr/pFcf/evEbitda 已經驗證過的既有模式，不用另外設計股價要取哪一天。
//
// null_reason 沿用 evEbitda/roe 已定案的判斷：EPS_TTM 剛好等於 0 才是
// zero_or_negative_denominator，EPS_TTM 為負仍然算出一個真實但為負的本益比（虧損公司
// 本益比為負是真實資訊，不是錯誤，不要隱藏成 null）。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100;
};

const toRatioFromNumbers = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface PeRatioPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWritePeRatioPit = async (query: QuarterlyMetricQuery): Promise<PeRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await getQuarterlyIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const stockPrice = mainAnchor ? await getStockPriceAsOf(symbol, mainAnchor.knowledgeDate) : null;

  // TTM：近四季（含本季）淨利加總 / 流通股數，跟 eps.ts 的 TTM 算法完全相同。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ttmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      ttmSum += picked.value;
    }
  }

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShare(ttmSum, sharesValue) : null;
  const peRatioTtm = epsTtm !== null && stockPrice !== null ? toRatioFromNumbers(stockPrice.closePrice, epsTtm) : null;

  let ttmNullReason: MetricNullReason | null = null;
  if (peRatioTtm === null) {
    if (!ttmComplete) ttmNullReason = 'insufficient_history';
    else if (epsTtm === null || stockPrice === null) ttmNullReason = 'missing_input';
    else ttmNullReason = 'zero_or_negative_denominator';
  }

  const coordinateBase = { symbol, metricCode: 'peRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        basis: 'TTM',
        value: peRatioTtm,
        nullReason: ttmNullReason,
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
