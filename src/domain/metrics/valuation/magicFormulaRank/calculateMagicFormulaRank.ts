// 2026-10-01 從 scripts/backfillMagicFormulaRankPit.ts 搬來（逐字未改）：溯源表（getMagicFormulaRankProvenance.ts）
// 要用跟批次寫入同一條排名規則重排出兩個分項名次，規則只能有一份。
//
// 數值越高名次越前面（1 = 表現最好），跟 Greenblatt 原始方法一致；並列名次不特別處理，
// 用穩定排序後的序位當名次（ties 直接用先出現的排序位置，不做業界常見的「同分同名次、
// 下一名跳號」精細處理，這是業界常見的簡化）。呼叫端傳入的順序就是並列時的先後——批次寫入
// 跟溯源表都依 symbol 排序後傳入。
export const rankDescending = (entries: [string, number][]): Map<string, number> => {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const rankMap = new Map<string, number>();
  sorted.forEach(([symbol], index) => rankMap.set(symbol, index + 1));
  return rankMap;
};
