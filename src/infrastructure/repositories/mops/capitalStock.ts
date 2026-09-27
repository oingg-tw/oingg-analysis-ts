import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { isUndefinedTableError } from './prismaErrors';
import { logger } from '@/infrastructure/logger';
import { pickPaidInSharesRow, reconcileWithBalanceSheet, type BalanceSheetCapital } from '@/domain/financials/paidInSharesRow';
import type { CapitalStockHistoryEntry, CapitalStockHistoryPort, OutstandingCommonSharesAsOf, OutstandingCommonSharesPort, ShareBasisEventsAsOf } from '@/application/ports/capitalStock';
import { effectivePreferredDividends, computeOutstandingCommonShares } from '@/domain/financials/outstandingCommonShares';
import { getShareAdjustmentsAsOf, isKnownPreferredIssuer } from './shareAdjustments';
import { getPreferredDividendsTtmAsOf } from './equityChangeXbrl';
import { capitalReductionResumption, confirmedParChanges, inferUnrecordedParChange, parSwitchDate, shareSplitFactor, type ParRow } from '@/domain/financials/parValueBasis';
import { matchDividendDeclarations, type ShareBasisEvent } from '@/domain/financials/liveShareBasis';
import { listClosesBothExchanges } from '../twse/dailyPriceSeries';

// PaidInSharesAsOf 型別 2026-09-17 Phase 3 搬到 application/ports/capitalStock.ts；CapitalStockHistoryEntry/
// CapitalStockChangeSource 在 Phase 4 跟進（對外回應的 zod schema 在 http/modules/companies/types.ts），
// 這裡 re-export 給既有 import 路徑。
export type { CapitalStockHistoryEntry, OutstandingCommonSharesAsOf };

interface RawCapitalStockRow {
  effective_year: number;
  effective_month: number;
  paid_in_shares: bigint | null;
  par_value: unknown;
  misaligned: boolean; // 股數 ÷（資本÷面額）剛好 10^k、k≠0
  amount_shares: bigint | null; // 實收資本 ÷ 面額（2026-09-26 核定股數判準用）
  authorized_shares: bigint | null;
  paid_in_capital: bigint | null;
}

// 每家一次查詢、快取一小時（回填時同一家會被問幾十次；面額變更、漏記事件一年全市場十來筆，絕大多數公司查完就結束）。
const HOURLY_TTL_MS = 60 * 60 * 1000;
const hourly = <T>(load: (symbol: string) => Promise<T>) => {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  return (symbol: string): Promise<T> => {
    const hit = cache.get(symbol);
    if (hit && Date.now() - hit.at < HOURLY_TTL_MS) return hit.value;
    const value = load(symbol);
    cache.set(symbol, { at: Date.now(), value });
    return value;
  };
};

// 2026-09-27 規則 B（見 domain/financials/parValueBasis.ts inferUnrecordedParChange）：股本歷史漏記的面額變更，
// 用 company_profile 現況面額＋股價跳動補一筆。股數（getIssuedSharesAsOf）與面額基準（getParRows）兩邊都要看到同一筆。
const getUnrecordedParChange = hourly(async (symbol: string): Promise<ParRow | null> => {
  const [latest, profile] = await Promise.all([
    mopsExportPrisma.$queryRaw<{ ym: number; par_value: unknown; paid_in_capital: bigint | null }[]>`
      SELECT effective_year * 100 + effective_month AS ym, par_value, paid_in_capital FROM "export"."capital_stock_history"
      WHERE symbol = ${symbol} ORDER BY effective_year DESC, effective_month DESC LIMIT 1`,
    mopsExportPrisma.$queryRaw<{ par_value: unknown; paid_in_capital: bigint | null }[]>`
      SELECT par_value, paid_in_capital FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1`,
  ]).catch(() => [[], []] as const);
  const l = latest[0];
  const p = profile[0];
  if (!l || !p || l.par_value === null || p.par_value === null || Number(l.par_value) === Number(p.par_value)) return null;
  const ym = Number(l.ym);
  const closes = await listClosesBothExchanges(symbol, new Date(Date.UTC(Math.floor(ym / 100), (ym % 100) - 1, 1)), new Date(Date.UTC(9999, 0, 1)));
  return inferUnrecordedParChange(
    { parValue: Number(l.par_value), paidInCapital: l.paid_in_capital === null ? null : BigInt(l.paid_in_capital) },
    { parValue: Number(p.par_value), paidInCapital: p.paid_in_capital === null ? null : BigInt(p.paid_in_capital) },
    closes
  );
});

// 2026-09-27 規則 A（見 domain/financials/paidInSharesRow.ts reconcileWithBalanceSheet）：每季資產負債表的普通股＋特別股股本（千元）。
// mops-ts export.quarterly_balance_sheet_xbrl，109Q3 起；兩種財報口徑的股本相同，合併報表優先。
const getBalanceSheetCapitalRows = hourly(async (symbol: string): Promise<(BalanceSheetCapital & { quarterEnd: Date })[]> =>
  mopsExportPrisma.$queryRaw<{ year: number; quarter: number; cap: bigint | null }[]>`
      SELECT DISTINCT ON (year, quarter) year, quarter, ROUND(COALESCE(ordinary_share, 0) + COALESCE(preference_share, 0))::bigint AS cap
      FROM "export"."quarterly_balance_sheet_xbrl"
      WHERE symbol = ${symbol} AND subsidiary_company_id = '' AND ordinary_share > 0
      ORDER BY year, quarter, data_type DESC`
    .then((rows) =>
      rows.map((r) => ({
        quarterEnd: new Date(Date.UTC(r.year + 1911, r.quarter * 3, 0)),
        quarterEndYm: (r.year + 1911) * 100 + r.quarter * 3,
        capitalThousands: BigInt(r.cap ?? 0),
      }))
    )
    .catch(() => [])
);

// 股本是歷史異動紀錄（現金增資、盈餘轉增資、減資…生效當月各一筆），不能直接抓整張表最新一筆。
// 查某個時間點（例如某季資產負債表的報告日）對應的流通股數，要找生效日 <= asOfDate 的最新一筆。
// 2026-09-03 使用者決定 curated 中台層現階段太早，改回直接查 mopsExportPrisma（etl_reader，
// export.capital_stock_history 這張 view 沒有唯一識別欄位，走 $queryRaw）。
//
// 2026-09-25 不採用「股數與實收資本對不上」的股本列——**這是最終狀態，不是等上游修好的暫時防線**。
// mops-ts 重抓原始 HTML 查明：不是他們的 parser 錯位，是 **MOPS 頁面本身兩格印得不一致**（1301 1999-03 實收股本金額格
// 印成股數 3,303,429,417；1201 1993-09 實收金額印成核定金額；1417 差 1000 倍…）。重抓拿到的是同樣的錯誤數字，
// **乾淨值不存在**，只能判斷哪一格可信、用那一格。
// 判準：「股數 ÷（實收資本 ÷ 面額）剛好是 10 的 k 次方、k≠0」視為這種印錯（面額 10，所以某格被印成另一格的值時比例恰好
// 10^k）。特別股、庫藏股造成的是 4157 那種 ×1.028 小差距，不擋；其他比例的 55 列不動。**跳過不是修值**——不自己 ÷10。
// 哪一格可信看股數跟前一筆一致列連不連貫（pickPaidInSharesRow）：連貫＝錯的是資本格、股數照用（6841 2025-06；
// mops-ts 用同一頁內部一致性獨立印證了 1301、1568 也是這樣）；不連貫＝股數格錯、跳過用更早一筆；沒有一致前一筆的判斷
// 不了，保守回 null（3131、5512、7851、8171 2025 那幾筆）。代價：跳過的列若同時是一次真的增減資，會沿用舊股數。
// 2026-09-25 量到最新一季（115Q2）受影響 7 家：1225、3131、5512、6546、6861、7851、8171。見記憶 project_capital_stock_history_coverage_gap。
// 所有讀股數的路徑（每股指標、市值 getMarketCapAsOf、liveMarketCap）都經過這支，擋一次就全部生效。
//
// 注意單位：這裡回傳的股數是實際股數（不是千股），但三張季度財報表的金額欄位
// （netIncome、equityValue…）單位是「千元」。算每股數字時分子要先 x1000 換算成元，
// 見 src/api/bff/bvps/service.ts 的 toPerShare——BVPS 曾因為漏了這個換算算出差 1000 倍的錯誤值。
// 已發行股數（capital_stock_history 實收股數，含特別股與庫藏股）＋面額。每股指標不要直接用它，用下面的 getOutstandingCommonSharesAsOf。
const getIssuedSharesAsOf = async (symbol: string, asOfDate: Date): Promise<{ issuedShares: bigint; parValue: number | null; effectiveYear: number; effectiveMonth: number } | null> => {
  const asOfYear = asOfDate.getUTCFullYear();
  const asOfMonth = asOfDate.getUTCMonth() + 1;

  let rows: RawCapitalStockRow[];
  try {
    rows = await mopsExportPrisma.$queryRaw<RawCapitalStockRow[]>`
      SELECT effective_year, effective_month, paid_in_shares, par_value, authorized_shares, paid_in_capital,
        CASE WHEN par_value > 0 AND paid_in_capital > 0 THEN ROUND(paid_in_capital / par_value)::bigint END AS amount_shares,
        COALESCE(
          paid_in_shares > 0 AND paid_in_capital > 0 AND par_value > 0
          AND ROUND(LOG(paid_in_shares::numeric / (paid_in_capital / par_value))) <> 0
          AND ABS(LOG(paid_in_shares::numeric / (paid_in_capital / par_value))
                  - ROUND(LOG(paid_in_shares::numeric / (paid_in_capital / par_value)))) < 0.0005,
          false) AS misaligned
      FROM "export"."capital_stock_history"
      WHERE symbol = ${symbol} AND (effective_year < ${asOfYear} OR (effective_year = ${asOfYear} AND effective_month <= ${asOfMonth}))
      ORDER BY effective_year DESC, effective_month DESC
    `;
  } catch (error) {
    // 2026-09-13：mops-ts 準備移除這張表（查無官方替代），見 prismaErrors.ts 的說明——
    // 表被刪掉後優雅降級成查無資料（null），不是讓依賴這個函式的每股數字（BVPS 等）
    // 跟著噴 500。真正的其他查詢失敗（連線問題等）仍然往上拋，不吞掉。
    if (isUndefinedTableError(error)) {
      logger.warn('[capital-stock]: export.capital_stock_history 表不存在（mops-ts 已移除），優雅降級為查無資料。');
      return null;
    }
    throw error;
  }
  // 規則 B：漏記的面額變更生效後，當成最新一列（股數＝實收資本 ÷ 新面額）。
  const unrecorded = await getUnrecordedParChange(symbol);
  if (unrecorded && unrecorded.ym <= asOfYear * 100 + asOfMonth) {
    rows.unshift({
      effective_year: Math.floor(unrecorded.ym / 100),
      effective_month: unrecorded.ym % 100,
      paid_in_shares: unrecorded.shares,
      par_value: unrecorded.parValue,
      misaligned: false,
      amount_shares: unrecorded.shares,
      authorized_shares: null,
      paid_in_capital: BigInt(Math.round(Number(unrecorded.shares) * unrecorded.parValue!)),
    });
  }
  const picked = pickPaidInSharesRow(rows);
  if (!picked) return null;
  const record = picked.row;
  const parValue = record.par_value === null || record.par_value === undefined ? null : Number(record.par_value);
  // 規則 A：整列跟 asOf 前最近一季資產負債表股本對不上（漏記減增資、實收／核定對調）→ 改用資產負債表股本 ÷ 面額。
  const bs = (await getBalanceSheetCapitalRows(symbol)).filter((r) => r.quarterEnd <= asOfDate).at(-1) ?? null;
  const issuedShares = reconcileWithBalanceSheet(
    { shares: picked.shares, ym: record.effective_year * 100 + record.effective_month, parValue, paidInCapital: record.paid_in_capital === null ? null : BigInt(record.paid_in_capital) },
    bs
  );
  return { issuedShares, parValue, effectiveYear: record.effective_year, effectiveMonth: record.effective_month };
};

// 流通在外普通股 = 已發行 − 特別股 − 庫藏股（IAS 33，見 domain/financials/outstandingCommonShares.ts）。
export const getOutstandingCommonSharesAsOf = async (symbol: string, asOfDate: Date): Promise<OutstandingCommonSharesAsOf | null> => {
  const issued = await getIssuedSharesAsOf(symbol, asOfDate);
  if (!issued) return null;
  const [adjustments, knownPreferredIssuer, preferredDividendsTtmThousands] = await Promise.all([
    getShareAdjustmentsAsOf(symbol, asOfDate),
    isKnownPreferredIssuer(symbol),
    getPreferredDividendsTtmAsOf(symbol, asOfDate),
  ]);
  const common = computeOutstandingCommonShares({ issuedShares: issued.issuedShares, parValue: issued.parValue, ...adjustments, knownPreferredIssuer });
  if (!common) return null;
  return { ...common, preferredDividendsTtmThousands: effectivePreferredDividends(preferredDividendsTtmThousands, common.preferredCapitalThousands), issuedShares: issued.issuedShares, effectiveYear: issued.effectiveYear, effectiveMonth: issued.effectiveMonth };
};

// 2026-09-26 面額基準（原在 twse/marketCap.ts，2026-09-27 搬來股本資料的家，跨期還原也要用）：
// 規則 B 補的面額變更接在最後（生效月一定在股本歷史最新一列之後）。
export const getParRows = hourly(async (symbol: string): Promise<ParRow[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ ym: number; par_value: unknown; paid_in_shares: bigint | null }[]>`
      SELECT effective_year * 100 + effective_month AS ym, par_value, paid_in_shares
      FROM "export"."capital_stock_history" WHERE symbol = ${symbol} ORDER BY ym ASC`
    .then((r) => r.map((x) => ({ ym: Number(x.ym), parValue: x.par_value === null ? null : Number(x.par_value), shares: x.paid_in_shares })))
    .catch((): ParRow[] => []);
  const unrecorded = await getUnrecordedParChange(symbol);
  return unrecorded ? [...rows, unrecorded] : rows;
});

// 2026-09-27 跨期比較每股數字的面額還原係數（見 domain/financials/parValueBasis.ts shareSplitFactor）。
// 2026-09-28 加股票股利與股數合併式減資（使用者：股價照下單軟體、每股數字換算到今天的股數基準——「只是股數變了、公司價值沒變」的都換算，
// IAS 33 對配股、分割、反分割都追溯調整）。時點用股本歷史的登記月，跟每期每股數字實際讀到的股本列一致（跟面額變更同一個規則）。
export const getShareSplitFactor = async (symbol: string, fromDate: Date, toDate: Date): Promise<number> => {
  const [parRows, { stock, reductions }] = await Promise.all([getParRows(symbol), getShareCountEvents(symbol)]);
  const inRange = (ym: number | null) => ym !== null && ym > ymOf(fromDate) && ym <= ymOf(toDate);
  const stockFactor = stock.filter((d) => inRange(d.registeredYm)).reduce((f, d) => f * d.multiplier, 1);
  const consolidationFactor = reductions.filter((r) => inRange(r.ym) && r.consolidation).reduce((f, r) => f * r.multiplier, 1);
  return shareSplitFactor(parRows, fromDate, toDate) * stockFactor * consolidationFactor;
};

// 2026-09-27 即時每股基準的事件（見 domain/financials/liveShareBasis.ts）。basisDate＝財報季末，asOf＝交易日。
// basisMultiplier：季末那天股本歷史股數 × 它 ＝ 季末當天市場交易的股數基準（登記跟市場換基準的日子不同）：
// - 股票股利季末前已除權、季末後才登記 → ×(1+配股率)
// - 面額變更／減資季末前已登記、市場還沒換發或恢復交易 → ÷倍數；反過來市場先換、登記在後 → ×倍數
// events：季末之後到 asOf（現金股利含 asOf 之後已公告的，給「已認列、還沒除息」加回用）。
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const ymOf = (d: Date) => d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
const monthStart = (ym: number) => new Date(Date.UTC(Math.floor(ym / 100), (ym % 100) - 1, 1));
const DAY = 86_400_000;
const parOr10 = (par: number | null) => (par && par > 0 ? par : 10);

// 2026-09-28 股票股利、減資、其他發行的時間軸（跨期還原 getShareSplitFactor 與即時基準 getShareBasisEvents 共用，每家快取一小時）。
// 只用實收資本金額的逐列變化，不用股本來源欄：來源欄的語意各家不一（5904 是這一列的變動、2436 連續兩列一模一樣），
// 也不用股數格（MOPS 股數格有 10^k 錯位）。面額變更那列資本不變、差額自然是 0。
// - 股票股利：登記那列＝除權之後第一個「資本增加至少九成配股金額（每股配發 × 參與股數）」的列，那部分金額從「其他發行」扣掉。
// - 減資：資本減少的列，倍數＝這列資本 ÷ 前一列資本。
interface CapitalRow {
  ym: number;
  par: number;
  prevCapital: number | null;
  delta: number;
  stockAttributed: number;
}
const getShareCountEvents = hourly(async (symbol: string) => {
  const [stockDividends, history] = await Promise.all([
    mopsExportPrisma.$queryRaw<{ ex_rights: Date; stock: number; par: number | null; tps: number | null }[]>`
      SELECT ex_rights_date AS ex_rights,
        (COALESCE(stock_dividend_from_earnings, 0) + COALESCE(stock_dividend_from_legal_reserve_and_capital_surplus, 0))::float8 AS stock,
        par_value::float8 AS par, total_participating_shares::float8 AS tps
      FROM "export"."dividend_distribution"
      WHERE symbol = ${symbol} AND ex_rights_date IS NOT NULL
        AND COALESCE(stock_dividend_from_earnings, 0) + COALESCE(stock_dividend_from_legal_reserve_and_capital_surplus, 0) > 0
      ORDER BY ex_rights_date`,
    mopsExportPrisma.$queryRaw<{ ym: number; capital: number | null; par: number | null }[]>`
      SELECT effective_year * 100 + effective_month AS ym, paid_in_capital::float8 AS capital, par_value::float8 AS par
      FROM "export"."capital_stock_history" WHERE symbol = ${symbol} ORDER BY 1`,
  ]).catch(() => [[], []] as const);
  const rows: CapitalRow[] = history.map((h, i) => {
    const prevCapital = i > 0 ? history[i - 1]!.capital : null;
    return { ym: Number(h.ym), par: parOr10(h.par), prevCapital, delta: h.capital && prevCapital ? h.capital - prevCapital : 0, stockAttributed: 0 };
  });
  const stock = stockDividends.map((d) => {
    const amount = d.stock * (d.tps ?? 0);
    const registered = rows.find((r) => r.ym >= ymOf(d.ex_rights) && amount > 0 && r.delta - r.stockAttributed >= 0.9 * amount);
    if (registered) registered.stockAttributed += amount;
    return { exRights: d.ex_rights, multiplier: 1 + d.stock / parOr10(d.par), registeredYm: registered?.ym ?? null };
  });
  const reductions = await Promise.all(
    rows
      .filter((r) => r.delta < 0 && r.prevCapital)
      .map(async (r) => {
        const multiplier = (r.prevCapital! + r.delta) / r.prevCapital!;
        // 跨期還原只算「確認是彌補虧損」的股數合併：停止交易後恢復交易那天股價跳 ÷倍數、沒有退還現金。退還股款的減資是還錢給股東
        // （IAS 33.29：跟特別股利合併的股數合併不追溯調整），追溯換算會把它算成每股淨值衰退（1441 2023-07 減資 37%，換算後成長率從 −14% 變 −46%）。
        // 減資類型公告欄位多半空白（2017 起減少兩成以上 250 列只有 25 列寫了），只能靠股價；2020-11 以前沒股價的判斷不了，不換算。
        let consolidation = false;
        if (1 / multiplier >= CONSOLIDATION_MIN_RATIO) {
          const start = new Date(monthStart(r.ym).getTime() - 60 * DAY);
          const closes = await listClosesBothExchanges(symbol, start, new Date(start.getTime() + 300 * DAY));
          const resumed = capitalReductionResumption(multiplier, r.par, closes);
          consolidation = resumed !== null && resumed.cashPerOldShare === 0;
        }
        return { ym: r.ym, par: r.par, multiplier, consolidation };
      })
  );
  return { rows, stock, reductions };
});

// 跨期還原只算「減少約兩成以上、而且股價確認是彌補虧損」的減資（反分割式的股數合併，見 getShareCountEvents）：註銷庫藏股、
// 限制員工權利新股這類小額減資，流通股數本來就不含，已發行股數變了、流通股數沒變，不能換算（跟 capitalReductionResumption 同一個門檻）。
const CONSOLIDATION_MIN_RATIO = 1.2;

export const getShareBasisEvents = async (symbol: string, basisDate: Date, asOf: Date): Promise<ShareBasisEventsAsOf> => {
  const since = addMonths(basisDate, -24);
  const basisYm = ymOf(basisDate);
  const asOfYm = ymOf(asOf);
  const oldestRelevantYm = ymOf(addMonths(basisDate, -12));
  const [dividends, equityChanges, shareCountEvents, parRows] = await Promise.all([
    mopsExportPrisma.$queryRaw<{ ex_div: Date; cash: number; cash_earnings: number; tps: number | null }[]>`
      SELECT ex_dividend_date AS ex_div,
        (COALESCE(cash_dividend_from_earnings, 0) + COALESCE(cash_dividend_from_legal_reserve_and_capital_surplus, 0))::float8 AS cash,
        COALESCE(cash_dividend_from_earnings, 0)::float8 AS cash_earnings, total_participating_shares::float8 AS tps
      FROM "export"."dividend_distribution"
      WHERE symbol = ${symbol} AND ex_dividend_date > ${since}`,
    // 權益變動表普通股現金股利：年初至今累計、宣告時認列、存成負數
    mopsExportPrisma.$queryRaw<{ year: number; quarter: number; v: number | null }[]>`
      SELECT DISTINCT ON (year, quarter) year, quarter, cash_dividends_of_ordinary_share::float8 AS v
      FROM "export"."equity_change_xbrl"
      WHERE symbol = ${symbol} AND member = 'TotalEquityMember' AND year >= ${since.getUTCFullYear() - 1912}
      ORDER BY year, quarter, data_type DESC`,
    getShareCountEvents(symbol),
    getParRows(symbol),
  ]);
  let basisMultiplier = 1;
  const events: ShareBasisEvent[] = [];
  const { rows } = shareCountEvents;

  // 現金股利：季末前宣告（權益已扣）的，逐筆對到權益變動表的季差分。只用盈餘配發那部分對（權益變動表這一欄只有盈餘分配；
  // 7769 每股 64.99 = 盈餘 54.99 + 資本公積 10，權益變動表 9,894,665 千元 = 54.99 × 1.8 億股），同一次決議、同時認列。
  const declarations = equityChanges
    .map((r, i) => {
      const prev = equityChanges[i - 1];
      const ytd = Math.abs(r.v ?? 0);
      const prevYtd = prev && prev.year === r.year && prev.quarter === r.quarter - 1 ? Math.abs(prev.v ?? 0) : 0;
      return { quarterEnd: new Date(Date.UTC(r.year + 1911, r.quarter * 3, 0)), amountThousands: r.quarter === 1 ? ytd : ytd - prevYtd };
    })
    .filter((d) => d.quarterEnd <= basisDate);
  const cashRows = dividends.filter((d) => d.cash > 0);
  const declaredAt = matchDividendDeclarations(
    declarations,
    cashRows.map((d) => ({ exDate: d.ex_div!, amountThousands: d.tps ? (d.cash_earnings * d.tps) / 1000 : NaN }))
  );
  cashRows.forEach((d, i) => {
    if (d.ex_div! > basisDate) events.push({ kind: 'cashDividend', date: d.ex_div!, perShare: d.cash, recognizedAtBasis: declaredAt[i] !== null });
  });

  // 股票股利：除權日換基準（登記月見 getShareCountEvents）
  for (const d of shareCountEvents.stock) {
    if (d.exRights > asOf) continue;
    if (d.exRights <= basisDate) {
      if (d.registeredYm === null || d.registeredYm > basisYm) basisMultiplier *= d.multiplier;
    } else events.push({ kind: 'shareChange', date: d.exRights, multiplier: d.multiplier, cashPerOldShare: 0 });
  }

  // 面額變更（含規則 B 補的）：換發日看股價跳動
  for (const c of confirmedParChanges(parRows)) {
    if (c.ym > asOfYm || c.ym < oldestRelevantYm) continue;
    const closes = await listClosesBothExchanges(symbol, new Date(monthStart(c.ym).getTime() - 120 * DAY), asOf);
    const switched = parSwitchDate(c, closes, asOf);
    const multiplier = c.oldPar / c.newPar;
    const registeredByBasis = c.ym <= basisYm;
    const switchedByBasis = switched !== null && switched <= basisDate;
    if (registeredByBasis && !switchedByBasis) basisMultiplier /= multiplier;
    if (!registeredByBasis && switchedByBasis) basisMultiplier *= multiplier;
    if (switched && switched > basisDate) events.push({ kind: 'shareChange', date: switched, multiplier, cashPerOldShare: 0 });
  }

  // 減資（資本減少的列）：恢復交易日看停止交易後的股價跳動；沒跳的（註銷庫藏股之類）不處理。倍數＝這列資本 ÷ 前一列資本。
  for (const { ym, multiplier, par } of shareCountEvents.reductions) {
    if (ym > asOfYm || ym < oldestRelevantYm) continue;
    const closes = await listClosesBothExchanges(symbol, new Date(monthStart(ym).getTime() - 60 * DAY), asOf);
    const resumed = capitalReductionResumption(multiplier, par, closes);
    if (!resumed) continue;
    const registeredByBasis = ym <= basisYm;
    const resumedByBasis = resumed.date <= basisDate;
    if (registeredByBasis && !resumedByBasis) basisMultiplier /= multiplier;
    if (!registeredByBasis && resumedByBasis) basisMultiplier *= multiplier;
    if (!resumedByBasis) events.push({ kind: 'shareChange', date: resumed.date, multiplier, cashPerOldShare: resumed.cashPerOldShare });
  }

  // 其他發行（現金增資、合併、可轉債轉換、員工認股、私募）：登記生效月加股數＝資本增加扣掉股票股利那部分 ÷ 面額。
  // 資本格 10^k 錯位的列會算出離譜的差額，超過一倍的不收。
  for (const r of rows) {
    const issued = r.delta - r.stockAttributed;
    if (r.ym > basisYm && r.ym <= asOfYm && r.prevCapital && issued > 0 && issued <= r.prevCapital) events.push({ kind: 'issue', date: monthStart(r.ym), newShares: issued / r.par });
  }

  return { basisMultiplier, events };
};

export const mopsOutstandingCommonShares: OutstandingCommonSharesPort = { getShareSplitFactor, getShareBasisEvents, getOutstandingCommonShares: getOutstandingCommonSharesAsOf };

interface RawCapitalStockHistoryRow {
  effective_year: number;
  effective_month: number;
  paid_in_shares: bigint | null;
  paid_in_capital: bigint | null;
  source_cash_increase: bigint | null;
  source_capital_reserve_transfer: bigint | null;
  source_retained_earnings_transfer: bigint | null;
  source_merger_increase: bigint | null;
  source_capital_reduction: bigint | null;
  source_other: string | null;
  remarks: string | null;
}

// 給個股頁面「股本變化」卡片用——2026-09-04 應 web-nuxt 要求新增，用途是讓使用者對照流通
// 股數變化跟 EPS 成長，判斷是真成長還是股本膨脹稀釋出來的假象。回傳全部歷史事件，由新到舊
// 排序，查無資料（mops 這批資料目前不是每家公司都有覆蓋）回傳空陣列，不拋錯、不是 404——
// 呼叫端要把「查不到歷史」當成正常情境處理。
export const getCapitalStockHistory = async (symbol: string): Promise<CapitalStockHistoryEntry[]> => {
  let rows: RawCapitalStockHistoryRow[];
  try {
    rows = await mopsExportPrisma.$queryRaw<RawCapitalStockHistoryRow[]>`
      SELECT effective_year, effective_month, paid_in_shares, paid_in_capital, source_cash_increase,
        source_capital_reserve_transfer, source_retained_earnings_transfer, source_merger_increase,
        source_capital_reduction, source_other, remarks
      FROM "export"."capital_stock_history"
      WHERE symbol = ${symbol} AND paid_in_shares IS NOT NULL
      ORDER BY effective_year DESC, effective_month DESC
    `;
  } catch (error) {
    if (isUndefinedTableError(error)) {
      logger.warn('[capital-stock]: export.capital_stock_history 表不存在（mops-ts 已移除），優雅降級為空陣列。');
      return [];
    }
    throw error;
  }

  // rows 是新到舊排序，index+1 才是時間序列上「更早的前一筆」，用來算變動百分比。
  return rows.map((row, index) => {
    const previous = rows[index + 1];
    const sharesChangePercent =
      previous?.paid_in_shares != null && previous.paid_in_shares !== 0n
        ? Math.round((Number(row.paid_in_shares! - previous.paid_in_shares) / Number(previous.paid_in_shares)) * 100 * 100) / 100
        : null;

    return {
      effectiveDate: `${row.effective_year}-${String(row.effective_month).padStart(2, '0')}`,
      paidInShares: row.paid_in_shares!.toString(),
      paidInCapital: row.paid_in_capital?.toString() ?? null,
      sharesChangePercent,
      changeSource: {
        cashIncrease: row.source_cash_increase?.toString() ?? null,
        capitalReserveTransfer: row.source_capital_reserve_transfer?.toString() ?? null,
        retainedEarningsTransfer: row.source_retained_earnings_transfer?.toString() ?? null,
        mergerIncrease: row.source_merger_increase?.toString() ?? null,
        capitalReduction: row.source_capital_reduction?.toString() ?? null,
        other: row.source_other,
      },
      remarks: row.remarks,
    };
  });
};

// application/ports/capitalStock.ts 的 CapitalStockHistoryPort 實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const mopsCapitalStockHistory: CapitalStockHistoryPort = { getCapitalStockHistory };
