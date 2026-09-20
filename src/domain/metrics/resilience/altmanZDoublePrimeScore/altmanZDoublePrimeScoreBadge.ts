import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

export const altmanZDoublePrimeScoreBadge: MetricBadge = {
  name: "Altman Z''-Score",
  nameEn: "Altman Z''-Score",
  author: 'Edward Altman, 1983',
  // 2026-09-20 sourceUrl 實際 fetch 驗證：同一個條目另外列出非製造業/新興市場版的四變數公式，並逐字寫出 Z > 2.6 - "safe" zone。
  sourceUrl: 'https://en.wikipedia.org/wiki/Altman_Z-score',
  summary: '結合 4 個財務比率的加權模型，是 Altman Z-Score 針對非製造業、新興市場公司調整過的版本。',
  detail:
    '紐約大學金融學教授 Edward Altman 於 1983 年（後於 1995 年延伸應用到新興市場）發表，是 1968 年原始' +
    'Altman Z-Score 的另一個獨立改版——刻意拿掉原版的 X5（資產週轉率），因為 Altman 認為週轉率在非製造業、' +
    '不同新興市場產業間差異過大，會扭曲跨產業比較。將營運資金／總資產、保留盈餘／總資產、稅前息前淨利／總' +
    '資產、帳面權益／負債帳面值這 4 個財務比率各自加權後加總，得出一個綜合分數，分數越低代表模型認定的財務' +
    '危機風險越高。這是一個統計模型，反映的是歷史樣本歸納出的風險關聯性。',
  timeframe: 'TTM',
  threshold: { description: '> 2.6', thresholdLatex: "\\mathrm{Z}'' > 2.6", note: 'Altman 1983/1995 論文劃定的安全區下限', denominator: 1, comparator: 'gt', value: 2.6 },
};
