import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const cashConversionCycleBadge: MetricBadge = {
  name: '負現金轉換循環',
  nameEn: 'Negative Cash Conversion Cycle',
  author: 'Michael Dell',
  summary: '現金轉換循環為負，代表公司能在支付供應商貨款之前就先收到客戶貨款，等於由供應商提供營運資金融通。',
  detail:
    '現金轉換循環（CCC）= 存貨天數 + 應收帳款天數 − 應付帳款天數，衡量公司從付錢買原料/存貨' +
    '到收回客戶貨款之間要自己墊多少天的營運資金。CCC 為負代表這個順序反過來：公司收到客戶' +
    '貨款的時間點，比付款給供應商還早，等於供應商在幫公司墊資金，不需要額外舉債或用自有' +
    '資金撐營運週轉。這個現象最著名的商業案例是 Dell 在 1990 年代建立的直銷模式（客戶先付款' +
    '訂購，Dell 再跟供應商採購組裝），後來也常見於 Amazon、Costco 這類「先收款、後付款」的' +
    '零售/電商業者，不是單一學術論文提出的法則，而是業界公認的營運資金效率指標。需要注意的' +
    '是：這個訊號的解讀跟產業特性高度相關——零售/量販業常態性負 CCC 是這個商業模式的正常' +
    '現象，不代表特別優異；製造業出現負 CCC 才比較少見、值得特別留意。',
  timeframe: 'TTM',
  threshold: { description: '< 0', thresholdLatex: '\\mathrm{CCC} < 0', denominator: 1, comparator: 'lt', value: 0 },
};
