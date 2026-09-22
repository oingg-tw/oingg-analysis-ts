import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveAverageBalances } from '../../shared/averageBalances';

// 這份檔案是 src/domainMetrics/roa.ts 的獨立重新實作，刻意不 import 它的（未 export 的）
// 私有函式，也不呼叫 calculateRoa() 本身——跟 src/domainPitMetrics/profitability/roe/computeRoePit.ts 同一種
// 「保持新管線對舊系統唯讀」原則。tests/domainPitMetrics/roaPit.test.ts 拿 roa.test.ts 的既有
// 基準數字交叉驗證。

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——總資產為負
// 仍然算得出一個（可能扭曲的）實際數字，不算 null（跟 roa.ts 現有對外行為一致）。

export type RoaDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

// 2026-09-22 formulaVersion 2：分母改期間平均總資產（Q 兩點、TTM 5 點），跟 roe 同一次改版，見 shared/averageBalances.ts。
export const ROA_FORMULA_VERSION = 2;

export type RoaComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeRoa = async (query: QuarterlyMetricQuery, deps: RoaDeps): Promise<RoaComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, balanceSheet] = await Promise.all([deps.statements.getIncomeStatement(key), deps.statements.getBalanceSheet(key)]);

  const netIncome = pickNetIncome(incomeStatement);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);

  const roaQuarterlyPct = netIncome.value !== null && balances.assetsAvgQ !== null ? toPercent(netIncome.value, balances.assetsAvgQ) : null;
  const quarterlyNullReason: MetricNullReason | null =
    roaQuarterlyPct !== null ? null : netIncome.value !== null && totalAssets !== null && balances.assetsAvgQ === null ? 'insufficient_history' : determineNullReason(netIncome.value, balances.assetsAvgQ ?? totalAssets);

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const coordinateBase = {
    symbol,
    metricCode: 'roa',
    fiscalYear,
    fiscalQuarter: seasonNum,
    dataType,
    subsidiaryCompanyId,
  };

  const versioned = (slot: ComputationSlot): ComputationSlot => (isComputationSkip(slot) ? slot : { ...slot, formulaVersion: ROA_FORMULA_VERSION });
  const q = versioned(periodSlot(mainAnchor, coordinateBase, 'Q', roaQuarterlyPct, quarterlyNullReason));

  // TTM：近四季（含本季）淨利加總 / 近四季窗口 5 個季末總資產平均。邏輯跟 computeRoePit.ts 的 TTM 處理一致，
  // 見那份檔案的說明——四季不齊時仍寫一列 value=null/insufficient_history，knowledge_date
  // 沿用本季（Q）自己的。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const roaTtmPct = ttmComplete && balances.assetsAvgTtm !== null ? toPercent(ttmSum, balances.assetsAvgTtm) : null;
  const ttmNullReason: MetricNullReason | null = roaTtmPct !== null ? null : ttmComplete && balances.assetsAvgTtm !== null ? determineNullReason(ttmSum, balances.assetsAvgTtm) : 'insufficient_history';

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
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: roaTtmPct,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
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

  return { symbol, rocYear: year, season, slots: { q, ttm: versioned(ttm) } };
};
