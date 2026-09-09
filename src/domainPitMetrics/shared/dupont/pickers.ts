// 從資產負債表/損益表挑「優先歸屬母公司口徑，缺漏才退回整體口徑」的既有通用規則——這是
// computeDupontFamilyPit.ts 編排層的輸入準備，不是任何單一 metricCode 的計算公式本身，
// 所以留在這裡（跟 orchestration 檔案同一層），不是拆進 pitMetrics/<分類>/<指標>/ 的對象。
export const pickNetIncome = (record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

export const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { value: record.totalEquity };
  return { value: null };
};
