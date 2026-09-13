import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const accrualsRatioBadge: MetricBadge = {
  name: '斯隆應計項目比率',
  nameEn: 'Sloan Accrual Ratio',
  author: 'Richard Sloan, 1996',
  summary: '衡量盈餘中「應計項目」佔比，比重越高代表盈餘品質可能越低。',
  detail:
    '加州大學柏克萊分校會計學教授 Richard Sloan 於 1996 年發表的經典論文，指出企業盈餘可拆成「現金流量」' +
    '與「應計項目」兩部分——應計項目（例如尚未收現的應收帳款增加、存貨增加等會計調整）的持續性通常低於' +
    '實際現金流量，佔比越高的公司，未來盈餘反轉或下修的機率往往越高。計算方式概念上為「（稅後淨利－營運' +
    '現金流）÷ 平均總資產」，比率越高代表當期盈餘越依賴會計估計與調整撐出來，而非實際收到的現金，是財報' +
    '鑑識領域最常被引用的盈餘品質指標之一。註：Sloan 原始論文用十分位排序法，本站採實務上常用的 ±10%' +
    '固定門檻，非原論文精確數字。',
  timeframe: 'TTM',
  threshold: {
    description: '絕對值 < 10%',
    thresholdLatex: '|\\mathrm{AccrualsRatio}| < 10',
    note: '實務上常用的應計項目異常門檻，非 Sloan 原始論文的十分位法',
    denominator: 1,
    comparator: 'abs_lt',
    value: 10,
  },
};
