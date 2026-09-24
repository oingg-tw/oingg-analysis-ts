import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';

// 2026-09-24：formulaLatex 跟實作對不對得起來，之前完全沒有守衛——公式寫錯不會有任何測試失敗，
// 只會讓使用者看到跟實際算法不符的算式。一次性稽核抓到 23 處，兩種都是「改了實作忘了改公式」：
//
//   1. 16 支 unit='%'、實際存的也是百分比（中位數 5~85），公式卻沒寫 ×100
//   2. 6 支分母在 2026-09-22 改成期間平均，公式還畫成期末（沒有 \overline）
//
// 這兩種都能用機械規則守住，就寫在這裡。**守不到的是更深的語意錯誤**（例如分子取錯科目），
// 那個沒有便宜的自動化辦法，只能靠 review。

const ROOT = join(process.cwd(), 'src');
const BS = String.fromCharCode(92);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
};

const withLatex = Object.entries(metricDefinitionRegistry).filter(([, d]) => Boolean(d?.formulaLatex));

describe('formulaLatex 要跟實作對得起來', () => {
  // ---- 規則 1：unit 是 % ⟺ 公式有 ×100 ----
  //
  // 例外只有「組合式」：右手邊的因子本身已經是百分比，再乘 100 反而錯。每一支都要寫清楚理由，
  // 不是想略過就加進來。
  const PERCENT_EXEMPT: Record<string, string> = {
    dupontDecomposedRoe: 'ROE = 淨利率 × 總資產週轉率 × 權益乘數，淨利率本身就是 %，乘積直接是 %',
    dupontExtendedRoe: '五因子相乘，其中三個因子本身是 %，乘積直接是 %',
    sgr: 'SGR = ROE × (1 − 配息率/100)，ROE 本身是 %',
    ruleOf40: '營收成長率(%) + 自由現金流利潤率(%)，兩個加項本身都是 %',
  };

  test('unit 是 % 的指標，formulaLatex 必須有 ×100（組合式除外）', () => {
    const missing = withLatex
      .filter(([code, d]) => d!.unit === '%' && !d!.formulaLatex!.includes('times 100') && !(code in PERCENT_EXEMPT))
      .map(([code]) => code);
    expect(missing, `這些指標存的是百分比但公式沒寫 ×100——改了實作要一起改公式；真的是組合式就加進 PERCENT_EXEMPT 並寫理由`).toEqual([]);
  });

  test('公式有 ×100 的指標，unit 必須是 %', () => {
    const wrongUnit = withLatex
      .filter(([, d]) => d!.formulaLatex!.includes('times 100') && d!.unit !== '%')
      .map(([code, d]) => `${code}(unit=${d!.unit})`);
    expect(wrongUnit, '公式乘了 100 但單位不是 %——兩邊只會有一邊是對的').toEqual([]);
  });

  test('PERCENT_EXEMPT 裡不能有已經不存在或其實有寫 ×100 的指標（例外清單要跟著縮）', () => {
    const stale = Object.keys(PERCENT_EXEMPT).filter((code) => {
      const d = metricDefinitionRegistry[code];
      return !d?.formulaLatex || d.formulaLatex.includes('times 100');
    });
    expect(stale, '例外清單有過期項目，該拿掉').toEqual([]);
  });

  // ---- 規則 2：實作走期間平均 → 公式要畫出平均 ----
  //
  // 判準綁「實作真的呼叫 resolveAverageBalances」而不是「formulaNote 提到平均」——
  // note 可能寫的是否定句（novyMarxGpToAssets 寫「不平均」），純字串比對會反向誤判。
  // 偵測是「檔案層級」的：家族檔一次算很多支指標，只有其中幾支的分母真的是平均餘額。
  // 所以例外清單不是在放水，是在記錄「這幾支跟平均無關」這個事實。三種理由：
  const AVERAGE_EXEMPT: Record<string, string> = {
    // (a) 組合式：平均在被引用的子指標裡，這一層再畫橫線反而錯
    sgr: 'ROE × (1 − 配息率/100)，平均在 ROE 的定義裡',
    dupontDecomposedRoe: '淨利率 × 總資產週轉率 × 權益乘數，平均在後兩個因子裡',
    dupontExtendedRoe: '五因子相乘，平均在週轉率與權益乘數裡',
    inventoryDays: '365 ÷ 存貨週轉率，平均在週轉率裡',
    receivablesDays: '365 ÷ 應收帳款週轉率，平均在週轉率裡',
    payablesDays: '365 ÷ 應付帳款週轉率，平均在週轉率裡',
    cashConversionCycle: 'DIO + DSO − DPO，平均在三個天數指標各自的週轉率裡',
    operatingCycle: 'DIO + DSO，同上',
    // (b) 分子分母都在損益表，根本沒有餘額可以平均
    netProfitMargin: '淨利 ÷ 營收，兩邊都是損益表流量',
    dupontTaxBurden: '淨利 ÷ 稅前淨利，兩邊都是損益表流量',
    dupontInterestBurden: '稅前淨利 ÷ EBIT，兩邊都是損益表流量',
    dupontEbitMargin: 'EBIT ÷ 營收，兩邊都是損益表流量',
    // (c) 刻意用期末，不是漏改
    inventoryToRevenueRatio: '本季期末存貨 ÷ 近四季營收，分子刻意取期末（見 formulaNote）',
    receivablesToRevenueRatio: '本季期末應收帳款 ÷ 近四季營收，同上',
  };

  test('實作用 resolveAverageBalances 的指標，formulaLatex 要標出平均（\\overline 或 Average）', () => {
    const averagingFiles = walk(ROOT).filter((f) => readFileSync(f, 'utf8').includes('resolveAverageBalances'));
    expect(averagingFiles.length, '一個檔案都沒找到——這條規則失效了，可能是 helper 改名').toBeGreaterThan(0);

    // 用平均的檔案裡出現過的 metricCode 字面量，就是受這條規則管的指標
    const codesInAveragingFiles = new Set<string>();
    for (const file of averagingFiles) {
      const content = readFileSync(file, 'utf8');
      for (const [code] of withLatex) {
        if (content.includes(`'${code}'`)) codesInAveragingFiles.add(code);
      }
    }

    const missing = [...codesInAveragingFiles]
      .filter((code) => {
        const latex = metricDefinitionRegistry[code]!.formulaLatex!;
        return !latex.includes(`${BS}overline`) && !latex.includes('Average') && !(code in AVERAGE_EXEMPT);
      })
      .sort();
    expect(missing, '分母是期間平均但公式畫成期末——2026-09-22 改口徑時就漏過 6 支').toEqual([]);
  });
});
