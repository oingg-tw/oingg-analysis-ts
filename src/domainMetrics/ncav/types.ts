import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type NcavQuery = QuarterlyMetricQuery;

export interface NcavResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // NCAV（每股淨流動資產價值）= (流動資產 - 總負債 - 特別股) / 流通股數。
  // 純資產負債表時點快照，沒有單季/年化/TTM 的區別。
  ncav: number | null;
  // 葛拉漢安全邊際價 = NCAV x (2/3)——葛拉漢認為用低於 NCAV 三分之二的價格買進才有足夠安全邊際。
  marginOfSafetyPrice: number | null;

  currentAssets: {
    value: string | null; // BigInt as string
  };
  totalLiabilities: {
    value: string | null; // BigInt as string
  };
  preferredStock: {
    // 只計入分類為權益的特別股（preferredStockCapital）。分類為金融負債的特別股
    // （preferredStockLiability，通常是可贖回特別股）已經算在 totalLiabilities 裡面，
    // 不會在這裡重複列出、也不會重複扣。查不到特別股欄位（或本來就沒有特別股）時視為 0，不是缺資料。
    value: string | null; // BigInt as string
  };
  paidInShares: {
    value: string | null; // BigInt as string
    // 股本資料的生效年月（西元曆），是「實際套用的那筆股本紀錄生效於何時」，不是本季的民國年季。
    effectiveYear: number | null;
    effectiveMonth: number | null;
  };
}
