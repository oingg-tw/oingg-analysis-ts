import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { pickEquityWithFieldKey, type PickedField } from '@/domain/metrics/shared/pickers';
import { averageBalance } from '@/domain/metrics/shared/numericHelpers';
import type { BalanceSheetFields } from '@/application/ports/financialStatements';
import type { PitDeps } from '@/application/metrics/deps';
import type { StatementDataType } from '@/domain/financials/quarterlyMetric';

// 2026-09-22 使用者拍板：「流量 ÷ 資產負債表存量」的比率（roe/roa/assetTurnover/equityMultiplier 與杜邦家族、sgr
// 內部的 ROE）分母從「本季期末值」改成**期間平均值**——
//   Q  ：(本季期末 + 上一季期末) / 2
//   TTM：近四季窗口的 5 個季末（t−4 … t）平均
// 動機（web-nuxt 2026-09-22 實測）：台股股東會集中 6 月，股利一經決議就從權益轉列應付股利，Q2 季末權益觸底，
// 期末分母讓 roe.TTM 每年 Q2 假性跳升（1216 統一 +2.8 個百分點、2412 同樣），高配息低成長的公司最明顯；
// 期末分母也跟 CFA 課綱／Bloomberg／Morningstar 的平均權益慣例不同。TTM 用 5 點平均而不是（t, t−4）兩點：
// 兩個端點都是同一季（例如都是 Q2），Q2 的低點仍會完整留在分母裡，季節性假象消不掉，5 點平均才會攤平。
// 缺任何一個季末的資產負債表 → 平均為 null，呼叫端寫 insufficient_history（不用較少的點頂替，理由跟 TTM 加總
// 不用三季頂替一樣：窗口變短數字就失真）。
// 這裡一次抓 5 季資產負債表，roe/roa/dupont/sgr 共用，避免每支各自再查一遍。

export interface AverageBalances {
  // 由舊到新，最後一筆是本季；缺季為 null。
  quarters: { year: string; season: string; fiscalYear: number; fiscalQuarter: number }[];
  balanceSheets: (BalanceSheetFields | null)[];
  equities: PickedField[];
  totalAssets: (bigint | null)[];
  currentBalanceSheet: BalanceSheetFields | null;
  currentEquity: PickedField; // 本季期末（給 provenance 與仍用期末值的消費者）
  equityAvgQ: bigint | null;
  equityAvgTtm: bigint | null;
  assetsAvgQ: bigint | null;
  assetsAvgTtm: bigint | null;
}

const TTM_POINTS = 5; // t−4 … t

// 任一資產負債表欄位（或欄位組合）的期間平均：'q' 取最後兩個季末、'ttm' 取全部 5 個季末。給 turnover 家族
// （存貨/應收/應付/PPE/淨營運資金）、roic/roce/croci/RNOA（投入資本）、accrualsRatio（總資產）這類跟 roe 同批改平均
// 的指標用，pick 回 null 的季末視為缺漏 → 平均為 null。
export const averageOf = (balances: AverageBalances, pick: (bs: BalanceSheetFields) => bigint | null, window: 'q' | 'ttm'): bigint | null => {
  const values = balances.balanceSheets.map((bs) => (bs ? pick(bs) : null));
  return averageBalance(window === 'q' ? values.slice(-2) : values);
};

export const resolveAverageBalances = async (
  key: { symbol: string; rocYear: number; season: Season; dataType: StatementDataType; subsidiaryCompanyId: string },
  deps: Pick<PitDeps, 'statements'>
): Promise<AverageBalances> => {
  const quarterKeys = getPastNQuarters({ rocYear: key.rocYear, season: key.season }, TTM_POINTS);
  const balanceSheets = await Promise.all(
    quarterKeys.map((tq) => deps.statements.getBalanceSheet({ symbol: key.symbol, year: Number(tq.year), quarter: Number(tq.season), dataType: key.dataType, subsidiaryCompanyId: key.subsidiaryCompanyId }))
  );
  const equities = balanceSheets.map((bs) => pickEquityWithFieldKey(bs));
  const totalAssets = balanceSheets.map((bs) => bs?.totalAssets ?? null);
  const equityValues = equities.map((e) => e.value);
  const last2 = <T>(xs: T[]): T[] => xs.slice(-2);
  return {
    quarters: quarterKeys.map((tq) => ({ year: tq.year, season: tq.season, fiscalYear: rocYearToGregorian(Number(tq.year)), fiscalQuarter: Number(tq.season) })),
    balanceSheets,
    equities,
    totalAssets,
    currentBalanceSheet: balanceSheets.at(-1) ?? null,
    currentEquity: equities.at(-1)!,
    equityAvgQ: averageBalance(last2(equityValues)),
    equityAvgTtm: averageBalance(equityValues),
    assetsAvgQ: averageBalance(last2(totalAssets)),
    assetsAvgTtm: averageBalance(totalAssets),
  };
};
