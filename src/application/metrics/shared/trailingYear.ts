import type { PitDeps } from '@/application/metrics/deps';
import type { CashFlowFields, IncomeStatementFields } from '@/application/ports/financialStatements';
import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';
import { getPastNQuarters, type Season } from '@/domain/calendar/rocQuarter';
import { subtractCumulative } from '@/domain/financials/semiannualFlows';

// 2026-10-01「近一年」流量的共用來源。上市櫃 = 近四季單季（跟改版前每支指標自己抓四季完全相同，值不變）；
// 興櫃 = 上年度下半年＋本年度上半年（或本年度上下半年），從累計數相減推出——使用者拍板為興櫃做半年頻，理由見
// application/ports/cumulativeStatements.ts。呼叫端對 periods 逐筆加總、任一筆缺就視為不齊，跟原本四季的規則一樣；
// knowledge date 用 periods 的 (year, season) 查公告日（下半年那筆是上年度 Q4＝年報公告日）。
//
// 怎麼判斷是半年報公司：看單季損益表的長相——興櫃的奇數季（Q1／Q3）整列不存在、偶數季列存在但數字全空
// （單季要用上季累計相減，沒有上季可減）。上市櫃的偶數季有真實數字，不會被誤判；只缺奇數季但偶數季有值的
// （資料缺漏）仍走四季、照樣算不齊，不會被累計數悄悄補上。
// ponytail: 判斷看的是「這個窗口」的損益表，不是公司現在的掛牌狀態——興櫃轉上櫃的公司舊窗口照半年頻算、新窗口照四季算，
// 這正是要的行為；若哪天出現「偶數季有單季數字、奇數季整列缺」的上市櫃公司，它會照四季算（不齊），不會被當半年報。
export type ReportingBasis = 'quarters' | 'semiannual';

export interface TrailingPeriod<T> {
  year: string; // 民國年
  season: Season; // 這段期間結束的那一季（上半年 = '2'、下半年 = '4'）
  record: T | null;
}

export interface TrailingYear<T> {
  basis: ReportingBasis;
  periods: TrailingPeriod<T>[];
}

type TrailingKey = { symbol: string; rocYear: number; season: Season; dataType: string; subsidiaryCompanyId: string };
type StatementDeps = Pick<PitDeps, 'statements' | 'cumulativeStatements'>;

const keyOf = (key: TrailingKey, year: number, quarter: number): QuarterlyKey => ({ symbol: key.symbol, year, quarter, dataType: key.dataType, subsidiaryCompanyId: key.subsidiaryCompanyId });

// 任何一個金額欄位有值就算「有單季數字」——興櫃的偶數季列是整列全空；只看營收／淨利幾個欄位會把只填了部分科目的上市櫃誤判成半年報。
const hasIncomeFlow = (r: IncomeStatementFields | null): boolean => r !== null && Object.values(r).some((v) => typeof v === 'bigint');

const fetchQuarterlyIncome = async (key: TrailingKey, deps: StatementDeps) => {
  const quarters = getPastNQuarters({ rocYear: key.rocYear, season: key.season }, 4);
  const records = await Promise.all(quarters.map((q) => deps.statements.getIncomeStatement(keyOf(key, Number(q.year), Number(q.season)))));
  return { quarters, records };
};

const isSemiannualWindow = (key: TrailingKey, quarters: { season: Season }[], records: (IncomeStatementFields | null)[]): boolean => {
  if (key.season !== '2' && key.season !== '4') return false;
  // 偶數季必須「列存在但全空」（興櫃的實際長相），整列不存在的是資料缺漏、不算半年報。
  return quarters.every((q, i) => (q.season === '1' || q.season === '3' ? records[i] === null : records[i] != null && !hasIncomeFlow(records[i] ?? null)));
};

// 半年期間：本季是 Q2 → [上年度下半年, 本年度上半年]；本季是 Q4 → [本年度上半年, 本年度下半年]。
const semiannualPeriods = async <T extends { reportDate: Date }>(
  key: TrailingKey,
  getCumulative: (k: QuarterlyKey) => Promise<T | null>,
  zeroWhenNull: readonly (keyof T)[]
): Promise<TrailingPeriod<T>[]> => {
  const secondHalf = async (year: number): Promise<T | null> => {
    const [full, h1] = await Promise.all([getCumulative(keyOf(key, year, 4)), getCumulative(keyOf(key, year, 2))]);
    return full && h1 ? subtractCumulative(full, h1, zeroWhenNull) : null;
  };
  const y = key.rocYear;
  return key.season === '2'
    ? [
        { year: String(y - 1), season: '4', record: await secondHalf(y - 1) },
        { year: String(y), season: '2', record: await getCumulative(keyOf(key, y, 2)) },
      ]
    : [
        { year: String(y), season: '2', record: await getCumulative(keyOf(key, y, 2)) },
        { year: String(y), season: '4', record: await secondHalf(y) },
      ];
};

export const resolveReportingBasis = async (key: TrailingKey, deps: StatementDeps): Promise<ReportingBasis> => {
  const { quarters, records } = await fetchQuarterlyIncome(key, deps);
  return isSemiannualWindow(key, quarters, records) ? 'semiannual' : 'quarters';
};

export const resolveTrailingIncomeStatements = async (key: TrailingKey, deps: StatementDeps): Promise<TrailingYear<IncomeStatementFields>> => {
  const { quarters, records } = await fetchQuarterlyIncome(key, deps);
  if (isSemiannualWindow(key, quarters, records)) {
    return { basis: 'semiannual', periods: await semiannualPeriods(key, (k) => deps.cumulativeStatements.getCumulativeIncomeStatement(k), []) };
  }
  return { basis: 'quarters', periods: quarters.map((q, i) => ({ year: q.year, season: q.season, record: records[i] ?? null })) };
};

// 現金流量表：興櫃連單季列都沒有，所以「是不是半年報」一律看同一個窗口的損益表長相（resolveReportingBasis）。
export const resolveTrailingCashFlowStatements = async (key: TrailingKey, deps: StatementDeps): Promise<TrailingYear<CashFlowFields>> => {
  if ((await resolveReportingBasis(key, deps)) === 'semiannual') {
    return { basis: 'semiannual', periods: await semiannualPeriods(key, (k) => deps.cumulativeStatements.getCumulativeCashFlowStatement(k), ['dividendsPaid']) };
  }
  const quarters = getPastNQuarters({ rocYear: key.rocYear, season: key.season }, 4);
  const records = await Promise.all(quarters.map((q) => deps.statements.getCashFlowStatement(keyOf(key, Number(q.year), Number(q.season)))));
  return { basis: 'quarters', periods: quarters.map((q, i) => ({ year: q.year, season: q.season, record: records[i] ?? null })) };
};

// 本季的期末日（knowledge date anchor、查股數／市值的時點）。只用現金流量表的指標原本讀「本季單季現金流」的 reportDate，
// 興櫃沒有單季現金流 → null → 整筆 skipped_no_knowledge_date 或股數查不到（2026-10-01 遷移後實測：dividendGrowthRate 等
// FY 1,780 筆、cashFlowPerShare TTM 298 筆）。半年報公司改讀同一季的累計現金流（期末日相同）；上市櫃缺單季列仍是 null，不被補上。
export const resolveCashFlowReportDate = async (key: TrailingKey, deps: StatementDeps): Promise<Date | null> => {
  const single = await deps.statements.getCashFlowStatement(keyOf(key, key.rocYear, Number(key.season)));
  if (single) return single.reportDate;
  if ((await resolveReportingBasis(key, deps)) !== 'semiannual') return null;
  return (await deps.cumulativeStatements.getCumulativeCashFlowStatement(keyOf(key, key.rocYear, Number(key.season))))?.reportDate ?? null;
};

// 溯源表（metric-provenance）的期間標籤：上市櫃「114 年第 3 季」、興櫃半年頻「114 年上半年／下半年」。
// 2026-10-01 使用者要求溯源表全部補齊，溯源 entry 的 role 一律用這個，不要再寫死「第 i/4 季」（興櫃只有兩段）。
export const trailingPeriodLabel = (period: { year: string; season: Season }, basis: ReportingBasis): string =>
  basis === 'semiannual' ? `${period.year} 年${period.season === '2' ? '上半年' : '下半年'}` : `${period.year} 年第 ${period.season} 季`;
