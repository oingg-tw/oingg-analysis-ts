// compute-engine 解析結果的健康檢查——純函式，零依賴，給 scripts/validateFormulaLatex.ts
// 與它的單元測試共用。
//
// 2026-09-24 抽出來的原因：validateFormulaLatex.ts 原本只 catch「解析丟例外」，但
// **compute-engine 看不懂時不丟例外**，它把 Error 節點包進 MathJSON 照常回傳。於是它兩週來
// 一直回報全綠，而其中 14 條是壞的。假綠燈比沒有守衛更危險，因為沒有人會再去看。
//
// 下面四條判準每一條都對應實際踩到過的形狀，而且其中兩條是先誤判過才修準的——
// 所以它們自己也需要測試（tests/unit/scripts/latexHealth.test.ts）。

export interface LatexProblem {
  code: 'error-node' | 'char-soup' | 'imaginary-unit' | 'fraction-collapsed';
  message: string;
}

export const inspectMathJson = (latex: string, json: string): LatexProblem | null => {
  if (json.includes('"Error"')) {
    return { code: 'error-node', message: 'MathJSON 含 Error 節點（符號名裡有非法字元，或型別對不上）' };
  }
  // \mathrm{ABC} 沒被當成一個符號，而是拆成 A×B×C
  if (/\["Multiply"(,"[A-Za-z]"){3,}\]/.test(json)) {
    return { code: 'char-soup', message: '符號被拆成單字元相乘（解析歧義）' };
  }
  // 下標或變數用了 i，被讀成虛數單位
  if (json.includes('"Complex"')) {
    return { code: 'imaginary-unit', message: '有符號被讀成虛數單位（通常是下標用了 i）' };
  }
  // 寫了分數卻解析不出除法 = 分子分母被代數約掉。(ΔEPS/EPS)/(ΔEBIT/EBIT) 會整個化簡成 1，
  // 因為 \Delta 被當成乘數符號然後上下消掉——沒有 Error，但公式結構整個消失。
  //
  // 兩個刻意的例外，都是誤判過才補上的：
  // 1. 判準綁「輸入有寫分數」而不是「輸出是常數」——門檻式 \mathrm{ThreeMarginsRising} = 3
  //    本來右手邊就是常數，那是合法的。
  // 2. 也認 Rational——除以常數（\frac{X}{100}）會被表示成 ["Rational",-1,100] 的乘法而不是
  //    Divide，那是正確解析不是約掉（sgr 踩過）。
  if (/\\d?frac/.test(latex) && !json.includes('"Divide"') && !json.includes('"Rational"')) {
    return { code: 'fraction-collapsed', message: '寫了分數卻解析不出除法（分子分母被代數約掉）' };
  }
  return null;
};
