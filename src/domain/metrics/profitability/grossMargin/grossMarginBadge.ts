import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Mary Buffett & David Clark《Warren Buffett and the Interpretation of Financial Statements》
// (2008)：毛利率持續 ≥40% 是耐久競爭優勢（護城河）訊號，書中舉可口可樂 60%、Moody's 73% 為例；
// <40% 代表競爭正在侵蝕獲利，<20% 代表沒有真正的優勢。
export const grossMarginBadge: MetricBadge = {
  name: '巴菲特毛利率',
  nameEn: 'Buffett Gross Margin',
  author: 'Mary Buffett, David Clark, 2008',
  // 2026-09-20 刻意沒有 sourceUrl（見 metricDefinitionSpec.ts 的欄位說明）：40% 這個門檻出自 Mary Buffett & David Clark《Warren Buffett and the Interpretation of Financial
  // Statements》(2008) 這本實體書，書本身沒有合法的免費全文可連；找到的線上頁面不是付費牆截斷、
  // 就是部落格自行改寫的轉述（明說是 inspired by 該書、數字是作者自己的歸納），都不符合「點進去
  // 看得到原始門檻」的契約，所以 sourceUrl 留空。**留空不代表門檻是本站自訂**——出處是真實可
  // 指名的書，記在 author。
  summary: '毛利率達到 40% 以上，符合書中耐久競爭優勢（護城河）企業的毛利率特徵。',
  detail:
    'Mary Buffett 與 David Clark 合著《Warren Buffett and the Interpretation of Financial ' +
    "Statements》指出，擁有耐久競爭優勢的企業毛利率通常持續維持在 40% 以上（書中舉可口可樂" +
    "約 60%、Moody's 約 73% 為例）；毛利率低於 40% 代表競爭正在侵蝕獲利空間，低於 20% 則" +
    '代表這個產業裡沒有企業擁有真正的競爭優勢。',
  timeframe: 'TTM',
  threshold: { description: '≥ 40%', thresholdLatex: '\\mathrm{GrossMargin} \\geq 40', denominator: 1, comparator: 'gte', value: 40 },
};
