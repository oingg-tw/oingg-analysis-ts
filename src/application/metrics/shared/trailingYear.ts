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
  half?: boolean; // true = 這一段是從累計數推出來的半年期間（不是單季）
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

// 2026-10-01 改成「逐半年判斷」：近一年窗口在 Q2／Q4 剛好是兩個半年段（Q2：上年度下半年＋本年度上半年；Q4：本年度上下半年），
// 每一段各自看長相——兩季都有單季列 → 用單季；奇數季整列缺、偶數季列在但全空（興櫃的長相）→ 用累計數推那半年。
// 原本要求整個窗口都是半年報才走半年頻，興櫃「準備上櫃、從今年起改報單季」的公司（2249、2938、3595、4537…，115 年 Q1 起有單季、
// 114 年仍只有半年報）兩邊都不符合，78 家興櫃的近一年 ROE 因此寫成 insufficient_history。逐段判斷後這種混合窗口＝上年度下半年（推）＋
// 本年度兩個單季。Q1／Q3 的窗口不是半年對齊，只走單季（上年度是半年報的話推不出單季 Q4，照樣不齊，結構性限制）。
// 偶數季必須「列存在但全空」才算半年報段；整列不存在的是資料缺漏，不被累計數悄悄補上。
type SegmentPlan = { year: number; half: 1 | 2; mode: 'quarters' | 'semiannual'; quarterIdx: [number, number] };

const planSegments = (key: TrailingKey, quarters: { year: string; season: Season }[], records: (IncomeStatementFields | null)[]): SegmentPlan[] | null => {
  if (key.season !== '2' && key.season !== '4') return null;
  const segments: [number, number][] = [
    [0, 1],
    [2, 3],
  ];
  return segments.map(([a, b]) => {
    const odd = records[a] ?? null;
    const even = records[b] ?? null;
    const semi = odd === null && even !== null && !hasIncomeFlow(even);
    return { year: Number(quarters[b]!.year), half: quarters[b]!.season === '2' ? 1 : 2, mode: semi ? 'semiannual' : 'quarters', quarterIdx: [a, b] };
  });
};

const basisOf = (plan: SegmentPlan[] | null): ReportingBasis => (plan?.some((seg) => seg.mode === 'semiannual') ? 'semiannual' : 'quarters');

// 依段落組 periods：單季段兩筆、半年段一筆（上半年 = Q2 累計；下半年 = 年報累計 − Q2 累計）。
const buildPeriods = async <T extends { reportDate: Date }>(
  key: TrailingKey,
  quarters: { year: string; season: Season }[],
  plan: SegmentPlan[] | null,
  singles: (T | null)[],
  getCumulative: (k: QuarterlyKey) => Promise<T | null>,
  zeroWhenNull: readonly (keyof T)[]
): Promise<TrailingPeriod<T>[]> => {
  if (!plan) return quarters.map((q, i) => ({ year: q.year, season: q.season, record: singles[i] ?? null }));
  const out: TrailingPeriod<T>[] = [];
  for (const seg of plan) {
    if (seg.mode === 'quarters') {
      for (const i of seg.quarterIdx) out.push({ year: quarters[i]!.year, season: quarters[i]!.season, record: singles[i] ?? null });
      continue;
    }
    if (seg.half === 1) {
      out.push({ year: String(seg.year), season: '2', half: true, record: await getCumulative(keyOf(key, seg.year, 2)) });
    } else {
      const [full, h1] = await Promise.all([getCumulative(keyOf(key, seg.year, 4)), getCumulative(keyOf(key, seg.year, 2))]);
      out.push({ year: String(seg.year), season: '4', half: true, record: full && h1 ? subtractCumulative(full, h1, zeroWhenNull) : null });
    }
  }
  return out;
};

export const resolveReportingBasis = async (key: TrailingKey, deps: StatementDeps): Promise<ReportingBasis> => {
  const { quarters, records } = await fetchQuarterlyIncome(key, deps);
  return basisOf(planSegments(key, quarters, records));
};

export const resolveTrailingIncomeStatements = async (key: TrailingKey, deps: StatementDeps): Promise<TrailingYear<IncomeStatementFields>> => {
  const { quarters, records } = await fetchQuarterlyIncome(key, deps);
  const plan = planSegments(key, quarters, records);
  const periods = await buildPeriods(key, quarters, plan, records, (k) => deps.cumulativeStatements.getCumulativeIncomeStatement(k), []);
  return { basis: basisOf(plan), periods };
};

// 現金流量表：興櫃連單季列都沒有，所以每一段是不是半年報一律看同一個窗口的損益表長相。
export const resolveTrailingCashFlowStatements = async (key: TrailingKey, deps: StatementDeps): Promise<TrailingYear<CashFlowFields>> => {
  const { quarters, records } = await fetchQuarterlyIncome(key, deps);
  const plan = planSegments(key, quarters, records);
  const singles = await Promise.all(quarters.map((q) => deps.statements.getCashFlowStatement(keyOf(key, Number(q.year), Number(q.season)))));
  const periods = await buildPeriods(key, quarters, plan, singles, (k) => deps.cumulativeStatements.getCumulativeCashFlowStatement(k), ['dividendsPaid']);
  return { basis: basisOf(plan), periods };
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
// 2026-10-01 逐半年判斷後，同一個窗口可能半年段與單季段混在一起（興櫃轉季報），所以優先看 period.half；舊呼叫端沒帶 half 時退回看 basis。
export const trailingPeriodLabel = (period: { year: string; season: Season; half?: boolean }, basis: ReportingBasis): string =>
  (period.half ?? basis === 'semiannual') ? `${period.year} 年${period.season === '2' ? '上半年' : '下半年'}` : `${period.year} 年第 ${period.season} 季`;
