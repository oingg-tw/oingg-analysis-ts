import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity } from '@/shared/quarterlyMetric';
import type { PriceAnchorSource } from '@/shared/sourceData/reportAnnouncementDate';

// year/season 選填，但要成對——只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
// 不給就自動抓最新一季有資產負債表資料的季度，跟其他指標「必填」不一樣，因為這個指標同時
// 需要「某季財報基本面」跟「市值（逐日）」，跟 valuation/marketRatios 討論過的介面設計一致。
export type AltmanZScoreQuery = QuarterlyMetricQuery;

export interface AltmanZScoreResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5——原始版（上市公司版）係數，五個變數
  // 任一為 null，Z 就是 null（見 fieldStatuses 找出是哪一個變數卡住）。
  zScore: number | null;
  // Safe (>2.99) / Grey (1.81~2.99) / Distress (<1.81)——原始版切點，跟 Z''-Score 的切點不一樣，
  // 兩個版本的分數不能互相比較（本服務只做原始版）。
  zone: 'safe' | 'grey' | 'distress' | null;

  x1: number | null; // (流動資產 − 流動負債) / 總資產
  x2: number | null; // 保留盈餘 / 總資產
  x3: number | null; // EBIT（TTM） / 總資產
  x4: number | null; // 股權市值 / 總負債帳面值
  x5: number | null; // 營收（TTM） / 總資產

  marketCap: {
    value: number | null;
    tradeDate: string | null; // 實際用到的股價交易日（股價基準日或之前最近一個重疊交易日）
    // 股價基準日的來源：'announcement' = 財報公告日（正確口徑）；'report_date_fallback' = 查無
    // 公告日，退回財報期末日估算（可能有 look-ahead bias，見 shared/sourceData/reportAnnouncementDate.ts）。
    priceAnchorSource: PriceAnchorSource | null;
  };
}
