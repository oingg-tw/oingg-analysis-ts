// 特別股清單排序用的純比較器（2026-09-17 Phase 4 從 http/modules/preferredStock/controller.ts 搬來，
// 邏輯逐字不變）——null 一律排最後（不管 asc/desc），是排名類欄位的常見慣例，避免「查無資料」
// 被 asc 排序誤導成排在最前面（看起來像是最小值，但其實只是沒有資料）。
export const compareBySortField = <T extends Record<string, unknown>>(a: T, b: T, sortField: string, sortOrder: 'asc' | 'desc'): number => {
  const direction = sortOrder === 'desc' ? -1 : 1;
  const av = a[sortField];
  const bv = b[sortField];
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * direction;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
  return 0;
};
