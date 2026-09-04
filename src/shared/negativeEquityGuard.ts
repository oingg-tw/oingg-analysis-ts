// 股東權益當分母/乘數因子時的通用邊界檢查——2026-09-04 新增。
//
// 背景：企業累計虧損導致股東權益轉負時，如果當期又是虧損（淨利也是負），「負淨利 / 負權益」
// 在純代數上會算出一個看起來正常甚至優異的正數，但經濟意義上是嚴重誤導（公司其實已經逼近
// 資產不足）。roe/deRatio/nissimPenmanRnoa 三支指標各自用幾乎一樣的文字手動判斷、手動 push
// 這個警告；審查發現 dupont 的權益乘數（= 總資產/權益）只擋了「權益剛好等於零」的除以零錯誤，
// 完全沒有對「權益為負」示警——decomposedRoe 是淨利率 x 週轉率 x 權益乘數三者相乘，跟直接
// 除法一樣會被「兩個負數」的符號抵消掉，同一種失真透過乘法路徑悄悄穿透，卻沒人守。
//
// 統一到這裡不是為了套用 src/shared/metricStatus.ts 那套結構化 status（那是另一個更大的
// 遷移決定，見該檔案開頭的說明，這裡不擴大範圍），只是把「同一句警告文字 + 同一個判斷條件」
// 收斂成一個函式，避免下一支新指標又手動複製一次、或又漏掉負值判斷只擋了等於零。
export const negativeEquityWarning = (equityValue: bigint | null, indicatorLabel: string): string | null => {
  if (equityValue === null || equityValue > 0n) return null;
  return `本季期末權益為零或負數，${indicatorLabel}數值意義有限，請自行判斷是否採用。`;
};
