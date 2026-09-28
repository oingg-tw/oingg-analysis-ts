// 2026-09-28 營業費用四分拆（推銷＋管理＋研發＋IFRS9 預期信用減損 = 營業費用合計）的缺行處理，使用者拍板「恆等式驗證過才當 0」。
// XBRL 裡某一季沒有那筆費用時，那一行就不會出現（不是 0 而是缺）；之前一律當缺資料，近四季只要有一季缺行就整期 null
// 並標 insufficient_history——115Q2 營業費用有值的 1,893 家裡，預期信用減損 647 家、研發 405 家因此沒有近四季值
// （web-nuxt 做營業費用組成圖時抓到 6873/4142/2949 對不上）。
// 規則：那一季有營業費用合計、而「合計 − 有出現的各項」在 ±1 千元（進位）內，缺的那幾行才當 0；對不上就維持 null——
// mops 114Q4 單季表漏抓減損那一行的 4142（差 27,704 千元）、2949（差 179）會被留在 null，不會安靜變成錯的 0。
// ponytail: 缺兩行以上且差額 0 時全部當 0；理論上可能是 +x 與 −x（減損迴轉為負）互抵，實務上沒看過，真遇到再改成只補單一缺行。
export interface OperatingExpenseComponents {
  operatingExpense: bigint | null;
  sellingExpenses: bigint | null;
  adminExpenses: bigint | null;
  researchAndDevelopmentExpense: bigint | null;
  expectedCreditLoss: bigint | null;
}

const COMPONENTS = ['sellingExpenses', 'adminExpenses', 'researchAndDevelopmentExpense', 'expectedCreditLoss'] as const;
const ROUNDING_TOLERANCE_THOUSANDS = 1n;

export const fillAbsentOperatingExpenseComponents = <T extends OperatingExpenseComponents>(row: T): T => {
  if (row.operatingExpense === null || row.operatingExpense === undefined) return row;
  const absent = COMPONENTS.filter((c) => row[c] === null || row[c] === undefined);
  if (absent.length === 0 || absent.length === COMPONENTS.length) return row;
  const residual = COMPONENTS.reduce((rest, c) => rest - (row[c] ?? 0n), row.operatingExpense);
  if (residual > ROUNDING_TOLERANCE_THOUSANDS || residual < -ROUNDING_TOLERANCE_THOUSANDS) return row;
  return { ...row, ...Object.fromEntries(absent.map((c) => [c, 0n])) };
};
