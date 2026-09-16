import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeValue as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案是 src/domainMetrics/zmijewskiScore.ts 的獨立重新實作。Probit 財務危機預警模型：
// X = -4.3 - 4.5*(NI_TTM/總資產) + 5.7*(總負債/總資產) - 0.004*(流動資產/流動負債)。
// 淨利用 TTM（原始模型用年度財報校準），其餘資產負債表科目是本季期末快照，沒有 YoY，
// 只有 TTM 一種 basis。只遷移 xScore，probabilityOfDistress（= Φ(xScore)，純函式轉換）
// 不獨立遷移。


export type ZmijewskiScoreDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'industry'>;

export type ZmijewskiScoreComputationBatch = ComputationBatch<'ttm'>;

export const computeZmijewskiScore = async (query: QuarterlyMetricQuery, deps: ZmijewskiScoreDeps): Promise<ZmijewskiScoreComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  // NI(TTM)：近四季（含本季）淨利加總。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked;
    }
  }
  const netIncomeTtmValue = ttmComplete ? netIncomeTtmSum : null;

  let xScore: number | null = null;
  if (netIncomeTtmValue !== null && totalAssets !== null && totalLiabilities !== null && currentAssets !== null && currentLiabilities !== null) {
    if (totalAssets !== 0n && currentLiabilities !== 0n) {
      const roa = Number(netIncomeTtmValue) / Number(totalAssets);
      const leverage = Number(totalLiabilities) / Number(totalAssets);
      const currentRatio = Number(currentAssets) / Number(currentLiabilities);
      xScore = Math.round((-4.3 - 4.5 * roa + 5.7 * leverage - 0.004 * currentRatio) * 10000) / 10000;
    }
  }

  let nullReason: MetricNullReason | null = null;
  if (xScore === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (totalAssets === null || totalLiabilities === null || currentAssets === null || currentLiabilities === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  // 2026-09-13：模型本身不適用金融保險業（見 isFinancialIndustryCompany 的說明），
  // 蓋過原本算出來的結果，不是資料缺漏。
  if (await deps.industry.isFinancialIndustryCompany(symbol)) {
    xScore = null;
    nullReason = 'not_applicable_industry';
  }

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        symbol,
        metricCode: 'zmijewskiScore',
        fiscalYear,
        fiscalQuarter: seasonNum,
        dataType,
        subsidiaryCompanyId,
        ...periodTypeGroup('TTM'),
        value: xScore,
        nullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
    if (!mainAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        symbol,
        metricCode: 'zmijewskiScore',
        fiscalYear,
        fiscalQuarter: seasonNum,
        dataType,
        subsidiaryCompanyId,
        ...periodTypeGroup('TTM'),
        value: null,
        // 沿用上面算好的 nullReason（金融保險業會是 not_applicable_industry），
        // 不要重新硬寫死 insufficient_history。
        nullReason,
        knowledgeDate: mainAnchor.knowledgeDate,
        knowledgeDateIsFallback: mainAnchor.isFallback,
      });
    }
  }

  return { symbol, rocYear: year, season, slots: { ttm } };
};
