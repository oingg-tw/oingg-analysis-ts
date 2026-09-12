import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const chowderNumberBadge: MetricBadge = {
  name: 'Chowder Rule',
  nameEn: 'Chowder Rule',
  author: 'Chowder, Seeking Alpha',
  summary: '現金殖利率加上股利五年成長率，越高代表股息「現在配得多」與「成長得快」兼具。',
  detail:
    'Chowder Number（Chowder Rule）源自 Seeking Alpha 一位暱稱為「Chowder」的資深存股社群用戶提出的簡易' +
    '法則：現金殖利率 + 股利五年成長率，用來一次衡量「現在的配息水準」與「未來的配息成長力」，因為單看' +
    '殖利率會漏掉成長股（配得少但成長快），單看成長率又會漏掉高殖利率的成熟股。社群慣例門檻是 12%' +
    '（公用事業等高配息、低成長產業慣例門檻較寬鬆，常見 8%，但本站尚無法自動判斷個股所屬產業是否適用' +
    '寬鬆門檻，故一律採一般門檻）。這是存股社群廣泛引用的經驗法則，不是學術論文，也不代表達標股票未來' +
    '股息保證持續成長。',
  token: 'FY',
  threshold: { description: '≥ 12%', thresholdLatex: '\\mathrm{Chowder} \\ge 12', note: '社群慣例門檻，未對公用事業等產業做寬鬆調整', denominator: 1, comparator: 'gte', value: 12 },
};
