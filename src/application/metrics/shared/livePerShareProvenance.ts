import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { ShareBasisEvent } from '@/domain/financials/liveShareBasis';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from './provenance/provenanceTypes';
import type { LivePerShare } from './livePerShare';

// 2026-10-01 live* 五支（liveMarketCap／livePbRatio／livePeRatio／liveGrahamNumber／livePegRatio）溯源表的共用部分。
//
// **只能溯源「最新一個交易日」**：live* 的計算本身就只有「現在」——收盤價取最新一筆、財報取目前最新已申報那一季
// （getLatestAvailableQuarter 不看日期），歷史上某一天寫進去的值，是用「當天」所知最新一季算的。拿今天的最新一季去重算
// 過去某天，數字會跟當天寫入的那列不同，又不會報錯——是「安靜錯的答案」。所以 asOfDate 早於最新收盤價的交易日時回
// found: false，不重建歷史；要回放歷史得讓 getLatestAvailableQuarter 按財報公告日回溯，等真的有人要查歷史 live* 再做。
export const LIVE_NOT_FOUND = (symbol: string, metricCode: MetricProvenanceResult['metricCode']): MetricProvenanceResult => ({
  symbol,
  metricCode,
  found: false,
  fiscalYear: null,
  fiscalQuarter: null,
  value: null,
  entries: [],
  methodologyNote: null,
});

export const isBeforeLatestTradeDate = (asOfDate: Date | undefined, tradeDate: Date): boolean => asOfDate !== undefined && asOfDate < tradeDate;

const day = (d: Date): string => d.toISOString().slice(0, 10);

const other = (role: string, sourceDescription: string, value: string | number | null): ProvenanceEntry => ({
  role,
  fiscalYear: null,
  fiscalQuarter: null,
  type: 'other',
  statementType: null,
  fieldKey: null,
  sourceDescription,
  value,
});

export const liveClosePriceEntry = (tradeDate: Date, close: number): ProvenanceEntry => other(`收盤價（${day(tradeDate)}）`, '證交所／櫃買中心每日收盤價', close);

const SHARE_EVENT_SOURCE = '公開資訊觀測站股利分派公告、股本變動申報（季末之後到交易日的事件）';

const describeEvent = (e: ShareBasisEvent, tradeDate: Date): ProvenanceEntry => {
  if (e.kind === 'cashDividend') {
    const effect = e.recognizedAtBasis
      ? e.date > tradeDate
        ? '季末已從權益扣除、交易日時尚未除息，每股淨值加回'
        : '季末已從權益扣除，不再重複扣'
      : '季末尚未認列，除息日從每股淨值扣除';
    return other(`除息 ${day(e.date)}：每股現金股利（${effect}）`, SHARE_EVENT_SOURCE, e.perShare);
  }
  if (e.kind === 'shareChange') {
    const cash = e.cashPerOldShare > 0 ? `，每股退還現金 ${e.cashPerOldShare} 元` : '';
    return other(`股數變動 ${day(e.date)}：股數倍數（除權、面額變更或減資恢復交易${cash}；每股淨值與 EPS 除以這個倍數）`, SHARE_EVENT_SOURCE, e.multiplier);
  }
  return other(`增資 ${day(e.date)}：新增股數（假設照每股淨值發行，每股數字不變）`, SHARE_EVENT_SOURCE, e.newShares);
};

// 每股淨值／EPS 的原始輸入（財報欄位、股數、特別股扣除、季末之後的股數基準事件）＋換算後的每股數字。
export const livePerShareEntries = (live: Extract<LivePerShare, { status: 'ok' }>, want: { bvps: boolean; eps: boolean }): ProvenanceEntry[] => {
  const { inputs, rocYear, season, tradeDate } = live;
  const fiscalYear = rocYearToGregorian(rocYear);
  const entries: ProvenanceEntry[] = [];

  if (want.bvps) {
    entries.push({ role: '最新一季期末權益（千元）', fiscalYear, fiscalQuarter: season, type: 'statementField', statementType: 'balanceSheet', fieldKey: inputs.equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(inputs.equity.value) });
  }
  if (want.eps) {
    for (const q of inputs.netIncomeTtm) {
      entries.push({ role: '近四季淨利之一（千元，EPS 分子）', fiscalYear: rocYearToGregorian(q.rocYear), fiscalQuarter: q.season, type: 'statementField', statementType: 'incomeStatement', fieldKey: q.picked.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(q.picked.value) });
    }
  }

  const { shares, basis } = inputs;
  if (shares) {
    const basisDate = inputs.reportDate ? day(inputs.reportDate) : '季末';
    entries.push(other(`流通在外普通股股數（${basisDate}，已發行 − 特別股 − 庫藏股）`, '公開發行公司股本變動申報', toProvenanceEntryValue(shares.outstandingCommonShares)));
    if (want.bvps && shares.preferredClaimThousands !== 0n) entries.push(other('權益扣除的特別股（千元，發行價計）', '公開資訊觀測站特別股權利、股利分派公告', toProvenanceEntryValue(shares.preferredClaimThousands)));
    if (want.eps && shares.preferredDividendsTtmThousands !== 0n) entries.push(other('淨利扣除的近四季特別股股利（千元）', '權益變動表特別股股利', toProvenanceEntryValue(shares.preferredDividendsTtmThousands)));
  }
  if (basis) {
    if (basis.basisMultiplier !== 1) entries.push(other('季末股數基準倍數（季末前已除權或換發、申報股數還沒反映的部分）', SHARE_EVENT_SOURCE, basis.basisMultiplier));
    // 只列真的影響交易日數字的事件：已發生的、以及季末已認列但交易日還沒除息（要加回）的現金股利。
    const relevant = basis.events.filter((e) => e.date <= tradeDate || (e.kind === 'cashDividend' && e.recognizedAtBasis));
    for (const e of relevant) {
      if (e.kind === 'cashDividend' && !want.bvps) continue; // 現金股利只影響每股淨值
      entries.push(describeEvent(e, tradeDate));
    }
  }

  if (want.bvps) entries.push(other(`每股淨值（換算到 ${day(tradeDate)} 股數基準）`, '由上列輸入計算', live.bvps));
  if (want.eps) entries.push(other(`近四季 EPS（換算到 ${day(tradeDate)} 股數基準）`, '由上列輸入計算', live.epsTtm));
  return entries;
};

export const LIVE_PER_SHARE_NOTE =
  '每股數字從最新一季財報出發：普通股權益（權益扣特別股發行價）× 1000 ÷ 季末流通在外普通股；近四季淨利扣特別股股利後 × 1000 ÷ 同一股數。' +
  '再依日期套用季末之後到交易日的事件換算到當天股價的基準：除息日扣現金股利（季末已認列的不重複扣）、除權／面額變更／減資恢復交易照股數倍數換算、' +
  '增資只加股數。最新一季季末離交易日超過 200 天不算（財報停更的公司不拿舊淨值硬推）。這支只溯源最新一個交易日：歷史上的值是用當天所知最新一季算的，不重建。';
