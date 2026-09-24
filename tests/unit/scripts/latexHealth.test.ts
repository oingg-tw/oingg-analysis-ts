import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { inspectMathJson } from '../../../scripts/latexHealth';

// 2026-09-24：這四條判準是 validateFormulaLatex.ts 的全部價值所在，而它們**自己就是那種
// 會安靜壞掉的東西**——原本的守衛只 catch 例外，兩週來回報全綠，實際上 14 條公式是壞的。
//
// 所以這支測試釘兩件事，缺一不可：
//   1. 每條判準真的抓得到它該抓的（否則守衛形同虛設）
//   2. 每條判準不會誤判合法的寫法（否則守衛會被當成雜訊關掉，等於也形同虛設）
// 第 2 組的案例全部來自實際誤判：threeMarginsRising 的常數門檻、sgr 的除以 100。
//
// json 字串是把實際 LaTeX 丟給 compute-engine 得到的真實輸出，不是手編的。

describe('inspectMathJson：抓得到四種「沒丟例外但其實壞掉」的形狀', () => {
  test('符號名含非法字元 → error-node', () => {
    const problem = inspectMathJson(
      String.raw`\mathrm{PRR} = \frac{\mathrm{MarketCap}}{\mathrm{R\&D}}`,
      '["Equal","PRR",["Divide","MarketCap",["Error",["ErrorCode","\'invalid-symbol\'","\'invalid-char\'"],["LatexString","\'\\\\mathrm{R\\\\&D}\'"]]]]'
    );
    assert.equal(problem?.code, 'error-node');
  });

  test('\\mathrm 沒被當成單一符號、被拆成單字元相乘 → char-soup', () => {
    const problem = inspectMathJson('mathrm{ROE}', '["Multiply","E","O","R","a","h","m","m","r","t"]');
    assert.equal(problem?.code, 'char-soup');
  });

  test('下標 i 被讀成虛數單位 → imaginary-unit', () => {
    const problem = inspectMathJson(
      String.raw`\max_{1 \le i \le 12} \mathrm{NetIncome}_{t-i}`,
      '["Max",["Tuple","_",["LessEqual",1,["Complex",0,1],12]]]'
    );
    assert.equal(problem?.code, 'imaginary-unit');
  });

  test('寫了分數卻被代數約掉 → fraction-collapsed', () => {
    // (ΔEPS/EPS)/(ΔEBIT/EBIT)：\Delta 被當成乘數符號，上下約掉後整條變成 1
    const problem = inspectMathJson(
      String.raw`\mathrm{DFL} = \dfrac{\Delta \mathrm{EPS} / \mathrm{EPS}}{\Delta \mathrm{EBIT} / \mathrm{EBIT}}`,
      '["Equal","DFL",1]'
    );
    assert.equal(problem?.code, 'fraction-collapsed');
  });
});

describe('inspectMathJson：不誤判合法的寫法（這組全部來自實際誤判）', () => {
  test('乾淨的公式沒有問題', () => {
    assert.equal(
      inspectMathJson(
        String.raw`\mathrm{ROE} = \frac{\mathrm{NetIncome}}{\mathrm{AverageEquity}}`,
        '["Equal","ROE",["Divide","NetIncome","AverageEquity"]]'
      ),
      null
    );
  });

  test('門檻式的右手邊本來就是常數，不算被化簡（threeMarginsRising）', () => {
    // 沒有寫分數，所以 fraction-collapsed 不該觸發
    assert.equal(inspectMathJson(String.raw`\mathrm{ThreeMarginsRising} = 3`, '["Equal","ThreeMarginsRising",3]'), null);
  });

  test('除以常數會變成 Rational 而不是 Divide，那是正確解析（sgr）', () => {
    assert.equal(
      inspectMathJson(
        String.raw`\mathrm{SGR} = \mathrm{ROE} \times \left(1 - \frac{\mathrm{DividendPayoutRatio}}{100}\right)`,
        '["Equal","SGR",["Multiply","ROE",["Add",["Multiply",["Rational",-1,100],"DividendPayoutRatio"],1]]]'
      ),
      null
    );
  });

  test('短符號名（兩三個字母）不算單字元相乘', () => {
    assert.equal(inspectMathJson(String.raw`\mathrm{EV} = \mathrm{A} + \mathrm{B}`, '["Equal","EV",["Add","A","B"]]'), null);
  });
});
