// 2026-09-27 即時每股基準（使用者：「希望我們網站的數據不要跟交易所一樣慢，畢竟除息當天股價就變了」＋「會當下股數變更的都要」）。
// 交易所的股價淨值比、本益比，每股淨值／EPS 只在新財報公布時更新（實測 6669 除息 144 元、1808 減資兩成，交易所反推的每股淨值都沒動，
// 要到下一季財報那天才變），股價卻在除息／除權／減資恢復交易當天就變了，中間那段基準對不上。
// 這裡從最近一季財報（季末）的股數、每股淨值、EPS 出發，依日期套用季末之後的事件，換算成跟當天股價同一個基準：
// - 現金股利：除息日從每股淨值扣掉。財報季末已經認列（宣告時就從權益扣掉，7769 第二季已扣 65 元、除息在 7/30）的，
//   除息日之前反而要加回來——股價那時還含息。
// - 股票股利、面額變更、減資（shareChange）：股數 × 倍數，每股淨值與 EPS ÷ 倍數；退還股款的減資另外從每股淨值扣掉退還的現金。
//   EPS 追溯換算照 IAS 33 對股票股利、分割、反分割的處理。
// - 其他發行（現金增資、合併增資）：股數加上新股，假設照每股淨值發行（每股淨值、EPS 不變）。
//   ponytail: 現金增資的認購價與折價（IAS 33 紅利因子）拿不到（dividend_distribution 認購價是空的），生效月才加股數；增資折價大時每股淨值會有落差。
export type ShareBasisEvent =
  | { kind: 'cashDividend'; date: Date; perShare: number; recognizedAtBasis: boolean }
  | { kind: 'shareChange'; date: Date; multiplier: number; cashPerOldShare: number }
  | { kind: 'issue'; date: Date; newShares: number };

export interface PerShareBasis {
  shares: number;
  bvps: number | null;
  eps: number | null;
}

// 同一天：現金股利（按舊股數配）先、股數變動後（2614 2026-10-06 同日除息除權）。
const sameDayOrder = (e: ShareBasisEvent): number => (e.kind === 'cashDividend' ? 0 : e.kind === 'shareChange' ? 1 : 2);

export const rollForwardPerShare = (base: PerShareBasis, events: ShareBasisEvent[], asOf: Date): PerShareBasis => {
  let { shares, bvps, eps } = base;
  for (const e of events) if (e.kind === 'cashDividend' && e.recognizedAtBasis && e.date > asOf && bvps !== null) bvps += e.perShare;
  const applied = events.filter((e) => e.date <= asOf).sort((a, b) => a.date.getTime() - b.date.getTime() || sameDayOrder(a) - sameDayOrder(b));
  for (const e of applied) {
    if (e.kind === 'cashDividend') {
      if (!e.recognizedAtBasis && bvps !== null) bvps -= e.perShare;
    } else if (e.kind === 'shareChange') {
      shares *= e.multiplier;
      if (bvps !== null) bvps = (bvps - e.cashPerOldShare) / e.multiplier;
      if (eps !== null) eps /= e.multiplier;
    } else {
      shares += e.newShares;
    }
  }
  return { shares, bvps, eps };
};

// 現金股利「季末前是否已認列」：權益變動表每季新增宣告的普通股現金股利（YTD 差分，千元）逐筆對到除息事件（每股 × 參與股數）。
// 宣告在第 k 季的股利，除息日通常在那季結束後半年內（年度股利：股東會 5~6 月、除息 7~8 月；台積電這種季配息：董事會後約 3.5 個月除息），
// 先找「季結束後半年內」、金額差 5% 內、最早的那筆，找不到才找「同一季內」除息的（股東會後當季就除息）。
// 從最早的差分依序配對，同額的連續配息（2330 6 元兩次）才不會配錯順序。對不到的事件當成季末還沒認列（除息日扣）。
// ponytail: 一季宣告兩筆以上、或參與股數跟宣告時差超過 5% 的會配不到，當成未認列；對不到的差分直接略過。
export interface DividendDeclaration {
  quarterEnd: Date;
  amountThousands: number;
}

export interface DividendExEvent {
  exDate: Date;
  amountThousands: number;
}

const DECLARATION_MATCH_TOLERANCE = 0.05;
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));

export const matchDividendDeclarations = (declarationsAsc: DividendDeclaration[], events: DividendExEvent[]): (Date | null)[] => {
  const declaredAt: (Date | null)[] = events.map(() => null);
  const byDate = events.map((e, i) => ({ ...e, i })).sort((a, b) => a.exDate.getTime() - b.exDate.getTime());
  for (const d of declarationsAsc) {
    if (d.amountThousands <= 0) continue;
    const quarterStart = addMonths(d.quarterEnd, -3);
    const near = (e: DividendExEvent) => Math.abs(e.amountThousands / d.amountThousands - 1) <= DECLARATION_MATCH_TOLERANCE;
    const free = byDate.filter((e) => declaredAt[e.i] === null && near(e));
    const hit = free.find((e) => e.exDate > d.quarterEnd && e.exDate <= addMonths(d.quarterEnd, 6)) ?? free.find((e) => e.exDate > quarterStart && e.exDate <= d.quarterEnd);
    if (hit) declaredAt[hit.i] = d.quarterEnd;
  }
  return declaredAt;
};
