# 指標公式表（`metricFormulas.csv`）

**規劃/參考用，不是程式碼在用的東西**——跟 `financialReportXbrl.csv`/`1101.csv` 一樣，目前
沒有任何 `.ts` 檔案讀取這個 CSV，之後要拿來管理 metrics/filter 時再接上。

## 欄位說明

一列定義一個複合指標（需要用其他數值算出來的指標），不是原始欄位本身：

| 欄位 | 說明 |
|---|---|
| `code` | 這個指標的代號，之後可以被別的列的 `operand1Code`/`operand2Code` 引用 |
| `nameEn` | 投資人看得懂的英文名稱 |
| `nameZh` | 投資人看得懂的中文名稱 |
| `operand1Code` | 運算元一的代號——可以是原始欄位代碼（例如 `financialReportXbrl.csv`/`1101.csv` 裡的 code），也可以是這張表裡另一個指標的 `code`（例如 `ROE` 引用 `BV`） |
| `operator` | 運算子（目前範例用 `-`/`/`） |
| `operand2Code` | 運算元二的代號，同上 |

## 已知限制：目前只能表達「兩個運算元 + 一個運算子」的單步公式

範例的 `ROE = postTaxEarning / BV` 剛好是單一除法就能表達，`BV = asset - liability` 也是
單一減法。但這個服務裡不少複合指標本身是多步驟公式，沒辦法塞進「兩個運算元 + 一個運算子」
這一列，例如：

- 杜邦分析（ROE = 淨利率 x 總資產週轉率 x 權益乘數）是三個運算元相乘，不是兩個。
- 現在的 `roeQuarterlyPct` 實際上是 `postTaxEarning / BV x 100`（乘 100 轉成百分比），
  比這裡的範例多一步。
- Altman Z-Score、Piotroski F-Score 這類是好幾個比率各自加權後加總，遠不只兩個運算元。

目前的解法（範例裡 `ROE` 引用 `BV` 這個做法本身已經示範了）是**把多步驟公式拆成好幾列，
中間結果各自給一個 `code`，後面的列用 `operand1Code`/`operand2Code` 引用前面算好的中間
結果**——`BV` 就是這樣被 `ROE` 引用的。三個以上運算元相乘（例如杜邦）或加權加總（例如
Z-Score）這類公式，之後真的要塞進這個格式，勢必也要拆成多個中間 code 逐步算，是設計上
刻意留給使用者自己決定怎麼拆，這裡先不假設任何特定的拆法。
