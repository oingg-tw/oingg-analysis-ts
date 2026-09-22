import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShareExact } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity, pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { isComputationSkip, computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-22 formulaVersion 2：中繼 EPS/BVPS/PER/PBR 都不再各自四捨五入，只在最後的 PER×PBR 四捨五入一次（見 numericHelpers.ts toPerShareExact 的說明）。
export const GRAHAM_NUMBER_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/grahamNumber.ts 的獨立重新實作——舊架構呼叫
// calculateEps()+calculateBvps()，這裡不依賴 eps/bvps 這兩個 metric_code 已寫入的值，
// 自己重新查資產負債表/損益表算 EPS(TTM)/BVPS。只有 TTM 一種 basis。
//
// 2026-09-10 使用者要求：公式改成 PER(TTM) × PBR，不要讓股價變成單獨要比較的變量——
// 原本 sqrt(22.5 × EPS × BVPS) vs 股價 的寫法，股價是拿來跟這支指標的結果比較用的
// 額外變量；改成 PER × PBR 之後，股價已經內含在 PER/PBR 各自的比率裡，門檻直接是
// 「grahamNumber < 22.5」的常數比較，不需要再引用另一支指標的股價欄位。數學上完全
// 等價：Price < sqrt(22.5×EPS×BVPS) ⟺ Price² < 22.5×EPS×BVPS ⟺ (Price/EPS)×
// (Price/BVPS) < 22.5 ⟺ PER×PBR < 22.5（EPS/BVPS/Price 皆為正時）。PER/PBR 獨立
// 重新計算，不依賴 peRatio/pbRatio 已寫入的值，算法直接複製自那兩支各自的 TTM/Q 邏輯，
// 保持每支 PIT 檔案獨立、不互相依賴的既有原則。


export type GrahamNumberDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market'>;

export type GrahamNumberComputationBatch = ComputationBatch<'ttm'>;

export const computeGrahamNumber = async (
  query: QuarterlyMetricQuery,
  deps: GrahamNumberDeps
): Promise<GrahamNumberComputationBatch> => {
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
  const [balanceSheet, incomeStatement] = await Promise.all([deps.statements.getBalanceSheet(key), deps.statements.getIncomeStatement(key)]);
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const bvps = equity.value !== null && sharesValue !== null ? toPerShareExact(equity.value, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const stockPrice = mainAnchor ? await deps.market.getStockPrice(symbol, mainAnchor.knowledgeDate) : null;
  const pbRatio = bvps !== null && bvps !== 0 && stockPrice !== null ? stockPrice.closePrice / bvps : null;

  // EPS(TTM)：近四季（含本季）淨利加總，算法跟 peRatio/eps 的 TTM 完全相同。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked.value;
    }
  }

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShareExact(netIncomeTtmSum, sharesValue) : null;
  const peRatioTtm = epsTtm !== null && epsTtm !== 0 && stockPrice !== null ? stockPrice.closePrice / epsTtm : null;

  // grahamNumber = PER × PBR，跟 peRatio/pbRatio 自己的 null_reason 判斷同一套哲學：
  // 分母（EPS/BVPS）剛好等於 0 才是 zero_or_negative_denominator，為負仍然算出一個
  // 真實但可能為負的比率，不隱藏成 null——虧損或資不抵債公司的 PER/PBR 為負是真實
  // 資訊，相乘後的 grahamNumber 也應該如實反映，不用額外判斷正負。
  const grahamNumber = peRatioTtm !== null && pbRatio !== null ? Math.round(peRatioTtm * pbRatio * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (grahamNumber === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (epsTtm === null || bvps === null || stockPrice === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  let ttm: ComputationSlot;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else {
    ttm = computation({
      symbol,
      metricCode: 'grahamNumber',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('TTM'),
      value: grahamNumber,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, slots: { ttm: isComputationSkip(ttm) ? ttm : { ...ttm, formulaVersion: GRAHAM_NUMBER_FORMULA_VERSION } } };
};
