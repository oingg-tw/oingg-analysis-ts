// 2026-09-26 改成「盈餘所屬年度」計次（使用者拍板，formulaVersion 2）。
// 舊定義「最新除息日往前 365 天內幾次」在 mops-ts 補齊 10 年股利後破功：年配公司只要今年除息日比去年早（1104 相隔 364 天、
// 4161 相隔 330 天），兩次都落在窗口內 → 被算成 2 次，全市場 799 家年配公司誤判成半年配（含 1101 台泥）。
// 之前看起來對，只是因為每家大多只有一年的資料。
// 新定義：最近兩個有分派紀錄的盈餘所屬年度裡，單一年度分派幾次取較大者（同一天除息只算一次）——年配 1、半年配 2、季配 4。
// 取兩年的最大值是因為最新那個盈餘年度常常還沒配完（季配公司年中只配了 2 次）；用前一年頂住，頻率改變則在新年度次數超過時反映。
// 盈餘所屬年度缺值的列不計（mops 股利表少數列 fiscal_year 為 null），全部缺值回 null。
export const calculateDistributionsPerFiscalYear = (events: { exDividendDate: Date; rocFiscalYear: number | null }[]): number | null => {
  const exDatesByYear = new Map<number, Set<string>>();
  for (const e of events) {
    if (e.rocFiscalYear === null) continue;
    const dates = exDatesByYear.get(e.rocFiscalYear) ?? new Set<string>();
    dates.add(e.exDividendDate.toISOString().slice(0, 10));
    exDatesByYear.set(e.rocFiscalYear, dates);
  }
  const latestTwo = [...exDatesByYear.keys()].sort((a, b) => b - a).slice(0, 2);
  return latestTwo.length === 0 ? null : Math.max(...latestTwo.map((year) => exDatesByYear.get(year)!.size));
};
