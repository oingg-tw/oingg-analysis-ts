// 直方圖分箱的純數學——2026-09-18 應 web-nuxt「殖利率市場排名」卡片展開後的分布圖需求新增，
// 只做「拿到邊界跟每個 bucket 的筆數之後，怎麼組出完整的 bins 陣列」這件事，不碰資料庫。
// 資料庫端用 Postgres 的 percentile_cont(0.01)/percentile_cont(0.99) 算出裁切邊界 p1/p99，
// width_bucket(value, p1, p99, bins) 算出每筆資料落在第幾個 bucket，見
// infrastructure/repositories/analysis/screenerQueries.ts 的 buildDistribution*Sql。

export interface DistributionBucket {
  min: number;
  max: number;
  count: number;
}

// Postgres width_bucket 對 [p1,p99] 範圍外的值回傳 0（< p1）或 bins+1（>= p99）——夾回
// [1, bins]，讓離群值（例如資料異常的極端殖利率）視覺上落進最左/最右一格，不會憑空消失。
// 這樣 bins 陣列的 count 加總永遠等於送進查詢的「value 非 null」筆數，呼叫端不用另外處理
// 「被排除掉多少筆」這種情況。
export const clampBucketIndex = (bucket: number, bins: number): number => Math.min(Math.max(bucket, 1), bins);

// p1 跟 p99 相同（例如全市場這個欄位只有 1~2 個不同的值，常見於資料剛開始回填、樣本數很少
// 的情況）時，等寬切割會除以零寬度，退化成單一 bucket 涵蓋 [p1,p99]、把全部筆數放進去，
// 不強行切成呼叫端要求的 bins 數量。
export const buildDistributionBins = (p1: number, p99: number, bins: number, countsByBucket: Map<number, number>): DistributionBucket[] => {
  const totalCount = [...countsByBucket.values()].reduce((sum, c) => sum + c, 0);
  if (p1 === p99) return [{ min: p1, max: p99, count: totalCount }];

  const width = (p99 - p1) / bins;
  const result: DistributionBucket[] = [];
  for (let i = 1; i <= bins; i++) {
    result.push({ min: p1 + (i - 1) * width, max: p1 + i * width, count: countsByBucket.get(i) ?? 0 });
  }
  return result;
};
