import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

export const ncavBadge: MetricBadge = {
  name: 'Net-Net 選股法',
  nameEn: 'Net-Net Strategy',
  author: 'Benjamin Graham, David Dodd, 1934',
  // 2026-09-20 sourceUrl 實際 fetch 驗證：有 NCAV = Total Current Assets - Total Liabilities 公式，並寫出 Graham 的做法是買 net current asset value greater than their market cap 的股票，同時指出概念出自 1934 年的 Security Analysis。
  sourceUrl: 'https://en.wikipedia.org/wiki/Net_current_asset_value',
  summary: '市值低於「流動資產減總負債」的淨流動資產價值（NCAV），Graham 從清算價值角度篩選股票的方法。',
  detail:
    'Benjamin Graham 提出的另一個保守估值角度，計算方式為流動資產減去全部負債（不含流動資產以外的其他' +
    '資產，如廠房設備），概念上接近「假設公司立刻清算，扣掉全部負債後，流動資產部分大約還剩多少」。當公司' +
    '市值低於 NCAV 時，傳統上被視為市場對公司的定價低於這個保守清算價值，因此又被稱為' +
    ' Net-Net 選股法（NCAV 跟市值都是公司總額，不是每股數字比較）。這是一個特定角度的估值參考方法，' +
    '不考慮公司未來獲利能力或成長性。',
  timeframe: 'Q',
  threshold: { description: '市值 < NCAV', thresholdLatex: '\\mathrm{MarketCap} < \\mathrm{NCAV}', denominator: 1, comparator: 'lt', compareAgainstFieldId: 'marketCap.Q' },
};
