import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickEquityWithFieldKey as pickEquity, pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricNullReason } from '@/domain/metrics/metricBasis';
import { isComputationSkip, noQuarterBatch, periodSlot, type ComputationBatch } from '@/domain/metrics/computation';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';
import type { PitDeps } from '../../deps';
import { resolveAverageBalances, type AverageBalances } from '../../shared/averageBalances';

// 這份檔案是 src/domainMetrics/roe.ts 的獨立重新實作，刻意不 import 它的（未 export 的）
// 私有函式，也不呼叫 calculateRoe() 本身——保持這條新管線對舊系統完全唯讀，不會觸發
// profitability_roe 的 upsert 副作用。兩份實作理論上算出相同數字，tests/pitMetrics/roePit.test.ts
// 拿 roe.test.ts 的既有基準數字交叉驗證，能抓到任一份實作的 bug，不是同一份邏輯繞一圈。
//
// 2026-09-10：抽出 resolveRoeQuarterData()，回傳原始欄位（附帶實際命中哪個 fieldKey）+
// 完整計算過程，給 getRoeProvenance.ts（GET /companies/:symbol/metric-provenance 的
// roe 試點）共用。2026-09-11：舊三大表已退役，PickedField 不再需要追蹤資料源（永遠是 XBRL）。
//
// 2026-09-17 clean architecture 重構 Phase 3 的試點：從 computeRoePit.ts（現在是暫時的 shim）
// 搬來並改成「純計算」——全部 I/O 透過 deps（PitDeps 的子集）注入、不再有預設參數綁真實
// adapter；computeRoe 回傳 ComputationBatch（每個 basis 一個槽，槽裡是準備寫入的完整資料或
// skip），寫入由 application/metrics/persistComputations.ts 負責。這讓 Q/TTM 的值、knowledge_date
// 傳染、null_reason 都能用 tests/fakes/pit 的記憶體 port 做單元測試（見
// tests/unit/application/metrics/profitability/roe/computeRoe.test.ts），不用連資料庫。

export type RoeDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

// 2026-09-22 formulaVersion 2：分母從本季期末權益改成期間平均權益（Q = 本季與上季期末平均、TTM = 5 個季末平均），
// 理由與定義見 shared/averageBalances.ts。分子不變。缺前期資產負債表 → insufficient_history。
export const ROE_FORMULA_VERSION = 2;

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——負權益仍然
// 算得出一個（可能扭曲的）實際數字，不算 null（跟 roe.ts 現有對外行為一致，這裡不改變語意）。
export interface RoeQuarterResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  netIncome: PickedField;
  equity: PickedField; // 本季期末權益（provenance 用），分母已改用 balances 裡的平均值
  balances: AverageBalances;
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

export const resolveRoeQuarterData = async (query: QuarterlyMetricQuery, deps: RoeDeps): Promise<RoeQuarterResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, balanceSheet] = await Promise.all([deps.statements.getIncomeStatement(key), deps.statements.getBalanceSheet(key)]);

  const netIncome = pickNetIncome(incomeStatement);
  const equity = pickEquity(balanceSheet);
  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);

  // 分母缺前期季末 → insufficient_history（本季自己的權益有、只是平均湊不齊）；本季權益本身就缺 → missing_input。
  const roeQuarterlyPct = netIncome.value !== null && balances.equityAvgQ !== null ? toPercent(netIncome.value, balances.equityAvgQ) : null;
  const quarterlyNullReason: MetricNullReason | null =
    roeQuarterlyPct !== null ? null : netIncome.value !== null && equity.value !== null && balances.equityAvgQ === null ? 'insufficient_history' : determineNullReason(netIncome.value, balances.equityAvgQ ?? equity.value);

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  // TTM：近四季（含本季）淨利加總 / 近四季窗口 5 個季末權益平均。四季損益表與 5 個季末資產負債表需全部存在，
  // 否則視為不齊——不齊時寫一列 value=null/null_reason=insufficient_history，knowledge_date
  // 沿用本季（Q）自己的 knowledge_date（本季資訊本身已知，只是 TTM 湊不齊）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const roeTtmPct = ttmComplete && balances.equityAvgTtm !== null ? toPercent(ttmSum, balances.equityAvgTtm) : null;
  const ttmNullReason: MetricNullReason | null = roeTtmPct !== null ? null : ttmComplete && balances.equityAvgTtm !== null ? determineNullReason(ttmSum, balances.equityAvgTtm) : 'insufficient_history';

  const ttmAnchor = ttmComplete
    ? await resolveKnowledgeDate(
        symbol,
        ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })),
        deps.announcements
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
    balances,
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

export type RoeComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeRoe = async (query: QuarterlyMetricQuery, deps: RoeDeps): Promise<RoeComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolution = await resolveRoeQuarterData(query, deps);
  if (!resolution) return noQuarterBatch(symbol, ['q', 'ttm']);

  const { rocYear, season, fiscalYear, fiscalQuarter, roeQuarterlyPct, quarterlyNullReason, mainAnchor, ttmComplete, roeTtmPct, ttmNullReason, ttmAnchor } = resolution;

  const coordinateBase = { symbol, metricCode: 'roe', fiscalYear, fiscalQuarter, dataType, subsidiaryCompanyId };

  const versioned = (slot: ReturnType<typeof periodSlot>) => (isComputationSkip(slot) ? slot : { ...slot, formulaVersion: ROE_FORMULA_VERSION });
  const q = versioned(periodSlot(mainAnchor, coordinateBase, 'Q', roeQuarterlyPct, quarterlyNullReason));
  // 四季齊全：用四季公告日的最大值當 knowledge_date（查不到就 skip）；不齊：寫 insufficient_history，
  // knowledge_date 沿用本季的 anchor（本季 anchor 也沒有就 skip）。
  const ttm = versioned(ttmComplete ? periodSlot(ttmAnchor, coordinateBase, 'TTM', roeTtmPct, ttmNullReason) : periodSlot(mainAnchor, coordinateBase, 'TTM', null, 'insufficient_history'));

  return { symbol, rocYear, season, slots: { q, ttm } };
};
