// 把回應 body 壓成「形狀」：釘住 key 集合、每個值的型別、陣列空/非空、enum 式的短識別字，
// 遮掉會隨上游資料每天變動的東西（數字、日期、中文名稱/標籤這類自由文字）。契約是形狀，
// 不是數值——數值層面的正確性由 verify:equivalence（指標）跟整合測試（repository）負責。
//
// 字串的處理規則：ISO 日期 → <date>；純數字字串（股票代號、Decimal 序列化）→ <numeric-string>；
// 短 ASCII 識別字（roe.TTM、3Y_1W、not_classified、gemini 這類 enum 值）原樣保留——bff-ts 對
// 這類值常有嚴格校驗（2026-09-16 beta 多一個 3Y_1W 窗口就讓對方 502），形狀 diff 要看得到；
// 其餘（中文名稱、產業標籤、說明文字）→ <string>。
// 陣列只保留第一個元素的形狀（空陣列跟非空陣列刻意區分）；物件 key 排序讓 diff 穩定。
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;
const ENUM_LIKE = /^[A-Za-z][A-Za-z0-9_./-]{0,23}$/;

export const shape = (value: unknown): unknown => {
  if (value === null) return '<null>';
  if (typeof value === 'number') return '<number>';
  if (typeof value === 'boolean') return '<boolean>';
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) return '<date>';
    if (NUMERIC_STRING.test(value)) return '<numeric-string>';
    if (ENUM_LIKE.test(value)) return value;
    return '<string>';
  }
  if (Array.isArray(value)) return value.length === 0 ? [] : [shape(value[0])];
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, shape(inner)])
    );
  }
  return `<${typeof value}>`;
};
