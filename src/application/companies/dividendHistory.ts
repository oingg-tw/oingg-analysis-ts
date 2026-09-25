import type { AppDeps } from '@/application/deps';
import type { DividendDistributionRow } from '@/application/ports/dividendEvents';
import { getMetricHistory } from '@/application/metrics/shared/queryMetricHistory';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';

// 2026-09-19 應 web-nuxt SEO 個股頁需求新增——「台積電 股利」這類頁面的核心表格：每個「股利所屬年度」
// 一列，由舊到新。資料源是 mops-ts 的 export.dividend_distribution（MOPS t108sb27 股利分派公告，
// 每股數字），一列＝一次分派決議：年配公司一年一筆、季配公司（例如 2330）一年四筆，所以先依所屬年度
// 彙總成年度列，同時把逐筆事件放在 events 裡，季配公司的四個除息日/發放日才不會被壓成一個。
//
// 三個衍生欄位的口徑（都是事實層的算術，不做任何「配息穩不穩」的判斷）：
// - payoutRatio：該年度現金股利 ÷ 該年度 EPS × 100。EPS 用 eps.FY＝年報公告的基本每股盈餘（2026-09-25 起；
//   原本是 eps.Q 四季加總——各季各用自己的期末股本，跟年報 EPS 不同，使用者拍板年度數字必須來自年報、
//   不從季資料拼，見 UBIQUITOUS_LANGUAGE.md〈三〉）。該年度沒有年報（例如今年）或 EPS ≤ 0 時為 null（虧損年度的配息率
//   沒有意義，不硬算成負數）。
// - yieldAtExDate：各次除息日「當天收盤價（已除息）」算的殖利率加總——年配公司就是 DPS ÷ 除息日收盤價；
//   季配公司是四次各自的殖利率相加，任一次查無當天股價整年為 null（目前只有種子公司有完整歷史股價，
//   其他公司 2026-06 之後才有，歷史列大多會是 null，這是 twse-ts 資料範圍，不是這裡算錯）。
// - knowledgeDate：該年度最後一次分派決議的公告日——這一列的數字最早何時被市場知道。
//
// 深度（2026-09-22 與 mops-ts 議定）：全市場回補範圍是**民國 109~115**（7 年），不會更早——他們使用者
// 定的全服務資料地板是 109Q3，股利照辦。回補前的現況是 114 年 1,469 家、更早每年只有 30~47 家種子公司。
// 注意這裡的年度是**盈餘所屬年度**不是除息年：fiscal 109 的除息日實際落在 2020-09~2021-09（半年配的 N 年
// 上半盈餘當年 9 月除息、年配要隔年夏天），所以 2020 上半的除息事件屬於 fiscal 108、不在範圍內。
// 有多少給多少，不補假資料。查無任何分派紀錄回 entries: []（200，不是 404——公司存不存在是 profile 的事）。
//
// 這支跟 consecutiveDividendYears 讀**不同資料源**、深度剛好相反（那支讀現金流量表 XBRL，多數公司從
// 民國 110 年起算所以上限 5），兩者不能互相驗證——2026-09-22 bff-ts 誤判成矛盾過一次，已在他們的端點
// 文件加註。見記憶 reference_mops_dividend_distribution_dataset。

const ISO_DATE = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const sumNonNull = (...values: (number | null)[]): number => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);

export interface DividendHistoryEvent {
  fiscalQuarter: number | null; // 季配公司才有值；年配公司這欄是 null
  cashDividend: number; // 元／股，盈餘 + 資本公積
  // 2026-09-25 股利來源拆開：使用者要求說明「股利從哪來」——不一定來自當年盈餘。110~113 年有發現金股利的
  // 4,265 個公司年度裡 520 個含資本公積、498 個「盈餘分配」超過當年 EPS（來自以前年度累積盈餘）。
  // 公告只分盈餘／資本公積兩種，「當年 vs 以前年度盈餘」公告沒有拆，由下游拿 fromEarnings 對照 eps 說明。
  cashDividendFromEarnings: number; // 元／股，盈餘分配（可能含以前年度累積的盈餘）
  cashDividendFromCapitalReserve: number; // 元／股，資本公積發放
  stockDividend: number; // 元／股（股票股利以面額計），盈餘 + 資本公積
  exDividendDate: string | null; // YYYY-MM-DD
  exRightsDate: string | null;
  paymentDate: string | null; // 現金股利發放日
  announcementDate: string | null;
  closeAtExDate: number | null; // 除息日收盤價（已除息）
  yieldAtExDate: number | null; // cashDividend ÷ closeAtExDate × 100
}

export interface DividendHistoryEntry {
  fiscalYear: number; // 西元，股利所屬年度
  rocFiscalYear: number;
  cashDividend: number;
  cashDividendFromEarnings: number; // 該年度各次加總，元／股
  cashDividendFromCapitalReserve: number; // 該年度各次加總，元／股
  stockDividend: number;
  totalDividend: number;
  distributionCount: number; // 這個年度分派幾次（年配 1、季配 4…）
  exDividendDate: string | null; // 該年度最後一次除息日；逐次日期看 events
  exRightsDate: string | null;
  paymentDate: string | null; // 該年度最後一次現金股利發放日
  eps: number | null; // 該年度年報 EPS（eps.FY），沒有年報為 null
  payoutRatio: number | null; // %，EPS ≤ 0 或缺 EPS 時為 null
  yieldAtExDate: number | null; // %，各次除息日殖利率加總，任一次查無股價為 null
  knowledgeDate: string | null;
  events: DividendHistoryEvent[];
}

export interface DividendHistoryResult {
  symbol: string;
  entries: DividendHistoryEntry[]; // 舊 → 新
}

export type DividendHistoryDeps = Pick<AppDeps, 'dividendEvents' | 'metricValueQueries' | 'market' | 'reportAvailability'>;

// 年度 EPS = eps.FY（年報公告值，一年一列、座標是該年度第四季）。沒有年報的年度不在 map 裡 → null。
const buildAnnualEps = async (symbol: string, deps: DividendHistoryDeps): Promise<Map<number, number | null>> => {
  const history = await getMetricHistory(symbol, 'eps', 'FY', await deps.reportAvailability.resolveDataType(symbol), '', 400, deps);
  return new Map(history.entries.map((entry) => [entry.fiscalYear, entry.value]));
};

const buildEvent = async (symbol: string, row: DividendDistributionRow, deps: DividendHistoryDeps): Promise<DividendHistoryEvent> => {
  const cashDividend = sumNonNull(row.cashDividendFromEarnings, row.cashDividendFromCapitalReserve);
  const stockDividend = sumNonNull(row.stockDividendFromEarnings, row.stockDividendFromCapitalReserve);
  // 有現金股利且有除息日才去查股價；純除權（只有股票股利）不算殖利率。
  const price = cashDividend > 0 && row.exDividendDate ? await deps.market.getStockPrice(symbol, row.exDividendDate) : null;
  const closeAtExDate = price?.closePrice ?? null;
  const yieldAtExDate = closeAtExDate !== null && closeAtExDate > 0 ? round2((cashDividend / closeAtExDate) * 100) : null;
  return {
    fiscalQuarter: row.fiscalQuarter,
    cashDividend: round2(cashDividend),
    cashDividendFromEarnings: round2(row.cashDividendFromEarnings ?? 0),
    cashDividendFromCapitalReserve: round2(row.cashDividendFromCapitalReserve ?? 0),
    stockDividend: round2(stockDividend),
    exDividendDate: ISO_DATE(row.exDividendDate),
    exRightsDate: ISO_DATE(row.exRightsDate),
    paymentDate: ISO_DATE(row.cashDividendPaymentDate),
    announcementDate: ISO_DATE(row.announcementDate),
    closeAtExDate,
    yieldAtExDate,
  };
};

const latestDate = (dates: (string | null)[]): string | null => dates.filter((d): d is string => d !== null).sort().at(-1) ?? null;

export const getCompanyDividendHistory = async (symbol: string, deps: DividendHistoryDeps): Promise<DividendHistoryResult> => {
  const rows = await deps.dividendEvents.listDividendDistributionRows(symbol);
  if (rows.length === 0) return { symbol, entries: [] };

  const [annualEps, events] = await Promise.all([buildAnnualEps(symbol, deps), Promise.all(rows.map((row) => buildEvent(symbol, row, deps)))]);

  const byYear = new Map<number, { row: DividendDistributionRow; event: DividendHistoryEvent }[]>();
  rows.forEach((row, i) => {
    const list = byYear.get(row.rocFiscalYear) ?? [];
    list.push({ row, event: events[i]! });
    byYear.set(row.rocFiscalYear, list);
  });

  const entries: DividendHistoryEntry[] = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rocFiscalYear, items]) => {
      const fiscalYear = rocYearToGregorian(rocFiscalYear);
      const yearEvents = items.map((i) => i.event);
      const cashDividend = round2(yearEvents.reduce((s, e) => s + e.cashDividend, 0));
      const cashDividendFromEarnings = round2(yearEvents.reduce((s, e) => s + e.cashDividendFromEarnings, 0));
      const cashDividendFromCapitalReserve = round2(yearEvents.reduce((s, e) => s + e.cashDividendFromCapitalReserve, 0));
      const stockDividend = round2(yearEvents.reduce((s, e) => s + e.stockDividend, 0));
      const eps = annualEps.get(fiscalYear) ?? null;
      const cashEvents = yearEvents.filter((e) => e.cashDividend > 0);
      const yieldComplete = cashEvents.length > 0 && cashEvents.every((e) => e.yieldAtExDate !== null);
      return {
        fiscalYear,
        rocFiscalYear,
        cashDividend,
        cashDividendFromEarnings,
        cashDividendFromCapitalReserve,
        stockDividend,
        totalDividend: round2(cashDividend + stockDividend),
        distributionCount: yearEvents.length,
        exDividendDate: latestDate(yearEvents.map((e) => e.exDividendDate)),
        exRightsDate: latestDate(yearEvents.map((e) => e.exRightsDate)),
        paymentDate: latestDate(yearEvents.map((e) => e.paymentDate)),
        eps,
        payoutRatio: eps !== null && eps > 0 ? round2((cashDividend / eps) * 100) : null,
        yieldAtExDate: yieldComplete ? round2(cashEvents.reduce((s, e) => s + e.yieldAtExDate!, 0)) : null,
        knowledgeDate: latestDate(yearEvents.map((e) => e.announcementDate)),
        events: yearEvents,
      };
    });

  return { symbol, entries };
};
