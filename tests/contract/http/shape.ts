// 把回應 body 壓成「形狀」：釘住 key 集合、每個值的型別、陣列空/非空、enum 式的短識別字，
// 遮掉會隨上游資料每天變動的東西（數字、日期、中文名稱/標籤這類自由文字）。契約是形狀，
// 不是數值——數值層面的正確性由 verify:equivalence（指標）跟整合測試（repository）負責。
//
// 字串的處理規則：ISO 日期 → <date>；純數字字串（股票代號、Decimal 序列化）→ <numeric-string>；
// 短 ASCII 識別字（roe.TTM、3Y_1W、not_classified、gemini 這類 enum 值）原樣保留——bff-ts 對
// 這類值常有嚴格校驗（2026-09-16 beta 多一個 3Y_1W 窗口就讓對方 502），形狀 diff 要看得到；
// 其餘（中文名稱、產業標籤、說明文字）→ <string>。
// 陣列合併**所有**元素的形狀（空陣列跟非空陣列刻意區分）；物件 key 排序讓 diff 穩定。
//
// 2026-09-25 改：原本陣列只取第一個元素的形狀。注意股清單每天換，第一檔的 observationDays 有時是
// null、有時有值，golden 就跟著翻——兩天翻兩次，程式碼一行都沒改。假警報多了會讓人習慣忽略紅燈。
//
// 現在合併所有元素，而且**只要有任何一筆非 null，就不記 <null>**。理由是重構計畫的既有分工：
// 「nullability 由 OpenAPI snapshot 釘住」——欄位可不可以是 null 本來就是 openapi.test.ts 的職責，
// golden 只管「有哪些欄位、各是什麼型別」。如果改成記 <null>|<number> 的聯集，某天清單剛好每筆都有值
// 就又變回 <number>，只是把翻的機率降低、沒有根除。
//
// 仍然會紅的情況：欄位被移除、新增欄位、型別改變（例如數字變字串）、整個清單的某欄全部變 null。
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;
const ENUM_LIKE = /^[A-Za-z][A-Za-z0-9_./-]{0,23}$/;

const NULL_SHAPE = '<null>';

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// 兩個形狀合併成一個，**只處理「空 vs 有值」**：null、空陣列、缺少的選填欄位都讓位給有內容的那一邊；
// 其他任何差異都維持第一筆（a）——也就是改之前的行為。
//
// 為什麼不把不同的值取聯集：試過，而且是錯的。「短英文識別字原樣保留」那條規則也會命中**資料**
// （ISIN 代碼、LINEPAY 這種英文公司名、指標目錄裡的每一支 metricCode），聯集之後 golden 變成資料清單
// ——每加一支指標、每換一檔股票就變，比原本的假警報更容易翻。只看第一筆時剛好只露出一個值、
// 而且很少變，才一直沒出問題。所以這裡刻意只修真正發生過的那一種翻轉。
const mergeShapes = (a: unknown, b: unknown): unknown => {
  if (a === NULL_SHAPE) return b;
  if (b === NULL_SHAPE) return a;
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => x.localeCompare(y));
    return Object.fromEntries(keys.map((k) => [k, k in a && k in b ? mergeShapes(a[k], b[k]) : k in a ? a[k] : b[k]]));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    return [mergeShapes(a[0], b[0])];
  }
  return a;
};

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
  if (Array.isArray(value)) return value.length === 0 ? [] : [value.map(shape).reduce(mergeShapes)];
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, shape(inner)])
    );
  }
  return `<${typeof value}>`;
};
