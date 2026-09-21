import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-22：范宏書、林彥廷（2010）〈研發密集公司剩餘報酬產生原因：風險溢酬或訂價錯誤？〉《證券市場發展季刊》
// 22(3): 1-38。sourceUrl 是證基會公開的全文 PDF（路徑含中文篇名，已下載逐字核對）。方法論逐字（第 13–14 頁）：
// 「本研究將所有 R&D 支出樣本公司按研發密度指標 RDAM…大小排序，分為五等級」；第 20 頁另用「淨研發資產除以
// 銷貨淨額 RDAS」重做（表 4 Panel B），最高五分位 GROUP5 後續第 1 年剩餘報酬 +23.87%（t=5.29）、第 2 年 +24.17%、
// 第 3 年 +7.72%，皆顯著；結論「先前相關研究所發現之高研發密度公司存在剩餘報酬現象，確實在台灣股票市場亦存在」。
// 樣本：1990–1998 台灣上市＋上櫃有研發支出公司 1,394 筆公司-年（排除金融業），剩餘報酬已控制規模與淨值市值比。
// 掛在 rdIntensity（研發費用/營收）而不是 priceToResearchRatio：後者 2026-09 只有 530 家有值（股本資料缺口），
// 等 mops-ts 回補後可再評估——Panel A（研發/市值）與 Chan-Lakonishok-Sougiannis (2001) 美國證據都撐那一支。
// 已知落差：(1) 論文分子是「五年直線法資本化的淨研發資產」，本站是當期研發費用，兩者對研發支出穩定的公司排序
// 接近、對剛開始/剛停止投入的公司會不同；(2) CLS (2001) 在美國發現「研發/銷貨」五分位沒有預測力（研發/市值才有），
// 這支徽章只有台灣證據撐，文案不寫成普世規律；(3) 樣本是 1990 年代。
export const rdIntensityBadge: MetricBadge = {
  name: '研發密度前 20%',
  nameEn: 'R&D Intensity Top Quintile',
  author: '范宏書、林彥廷, 2010',
  sourceUrl:
    'https://webline.sfi.org.tw/download/resh_ftp/RSFM/quarterly/pdf/%E7%A0%94%E7%99%BC%E5%AF%86%E9%9B%86%E5%85%AC%E5%8F%B8%E5%89%A9%E9%A4%98%E5%A0%B1%E9%85%AC%E7%94%A2%E7%94%9F%E5%8E%9F%E5%9B%A0%EF%BC%9A%E9%A2%A8%E9%9A%AA%E6%BA%A2%E9%85%AC%E6%88%96%E8%A8%82%E5%83%B9%E9%8C%AF%E8%AA%A4%EF%BC%9F.pdf',
  summary: '研發費用占營收的比率排在全市場最高的五分之一（前 20%），對照范宏書、林彥廷（2010）以台灣市場驗證的研發密集公司五分位中剩餘報酬最高的一組。',
  detail:
    '范宏書與林彥廷 2010 年以 1990–1998 年台灣上市櫃有研發支出的公司驗證：把公司依研發密度（研發資產相對於營收，' +
    '另一版相對於市值）由低到高分成五組，最高的一組在研發支出後續三年的剩餘報酬（已扣除規模與淨值市值比的風險溢酬）' +
    '顯著為正，第一年約 24%，並隨研發密度遞增。作者把這個現象歸因於研發投入帶來的風險溢酬，而不是市場錯價。' +
    '這是排名，不是絕對百分比門檻，本站直接沿用論文的五分位定義。同一時期美國的研究（Chan, Lakonishok & Sougiannis, ' +
    '2001）發現研發相對營收的排序在美國沒有預測力、研發相對市值才有，所以這支徽章的依據是台灣市場的證據。',
  timeframe: 'TTM',
  threshold: {
    description: '前 20%',
    thresholdLatex: '\\mathrm{RdIntensity\\ Percentile} \\geq 80',
    note: '范宏書、林彥廷（2010）用五等級（quintile）排序，最高一組即前 20%，不是絕對數字門檻。論文分子是資本化的淨研發資產，本站用當期研發費用；查無研發費用欄位的公司不在排名母體內。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 20 },
  },
};
