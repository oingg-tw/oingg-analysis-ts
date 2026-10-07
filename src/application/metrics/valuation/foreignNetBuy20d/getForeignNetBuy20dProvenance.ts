import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { resolveForeignNetBuy20d, type ForeignNetBuy20dDeps } from './computeForeignNetBuy20d';

// 2026-10-07 溯源表（「溯源表請務必都加上」）。跟 compute 共用 resolveForeignNetBuy20d，值一定等於寫入的值。
// 逐日列出 20 個交易日的外資買賣超股數（沒有法人交易的日子列 0），再列流通股數。
const OTHER = { fiscalYear: null, fiscalQuarter: null, type: 'other', statementType: null, fieldKey: null } as const;

export const getForeignNetBuy20dProvenance = async (query: { symbol: string; asOfDate?: Date | undefined }, deps: ForeignNetBuy20dDeps): Promise<MetricProvenanceResult> => {
  const { symbol } = query;
  const resolved = await resolveForeignNetBuy20d(symbol, query.asOfDate, deps);
  if (!resolved) return { symbol, metricCode: 'foreignNetBuy20d', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  const { window, netBuySum, shares, basisMultiplier, outstanding, result } = resolved;

  const byDate = new Map(window.rows.map((r) => [r.tradeDate.getTime(), r.netBuyShares]));
  const entries: ProvenanceEntry[] = [
    ...window.tradeDates.map((d): ProvenanceEntry => ({
      ...OTHER,
      role: `${d.toISOString().slice(0, 10)} 外資買賣超（股）`,
      sourceDescription: '證交所三大法人買賣超日報（T86）：外資及陸資（不含外資自營商）＋外資自營商',
      value: String(byDate.get(d.getTime()) ?? 0n),
    })),
    { ...OTHER, role: '20 日外資買賣超合計（股）', sourceDescription: '上面各日加總', value: String(netBuySum) },
    {
      ...OTHER,
      role: `流通在外普通股（已發行 − 特別股 − 庫藏股${basisMultiplier !== 1 ? `，× ${basisMultiplier} 換算成當天股數基準` : ''}）`,
      sourceDescription: '公開資訊觀測站股本變動',
      value: outstanding === null ? null : String(Math.round(outstanding)),
    },
  ];

  return {
    symbol,
    metricCode: 'foreignNetBuy20d',
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value: result.value,
    entries,
    methodologyNote:
      `最近 ${window.tradeDates.length} 個交易日外資買賣超股數合計 ÷ 流通在外普通股 × 100。只涵蓋上市公司；某天沒有法人交易視為 0。` +
      (shares === null ? '查不到流通股數，不算。' : '') +
      (window.tradeDates.length < 20 ? '三大法人日報 2026-09-01 起才有，累積不足 20 個交易日，不算。' : ''),
  };
};
