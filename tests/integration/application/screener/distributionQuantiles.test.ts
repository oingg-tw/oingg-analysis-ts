import { test, describe, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getFieldDistribution, getCompanyRank } from '@/application/screener/service';
import { appDeps } from '@/bootstrap/deps';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 2026-09-24 GET /screener/distribution 的 quantiles（五等分位邊界值）。
//
// 這支測試真正要守的不是「有沒有回四個數字」，而是**兩支獨立 SQL 之間的母體一致性**：
// quantiles 來自 buildDistributionBoundsSql、quintile 來自 buildRankingSql 的 NTILE(5)，
// 兩邊各自套用 excludeZero 條件。只要有人在其中一支漏掉 buildValueFilter，回應**不會報錯、
// 不會是 null**，只會安靜地變成「用另一個母體算出來的分位」——跟今天那個「只查上市沒查上櫃」
// 的 bug 同一個形狀（安靜地少掉一半母體）。所以斷言用交叉比對，不是自己跟自己比。
//
// 不寫死數值（股價每天變）：只釘住必然成立的關係。用 dividendYield.EOD 是因為 web-nuxt 的
// 需求就出在這個欄位，而且它是右偏長尾、有大量真實的 0（不配息），excludeZero 的效果最明顯。

const FIELD = 'dividendYield.EOD';

describe('GET /screener/distribution 的 quantiles', () => {
  test('四個分位單調遞增，且落在 [trueMin, trueMax] 之內', async () => {
    const d = await getFieldDistribution(FIELD, 25, true, appDeps);
    assert.ok(d.totalCount > 0, '母體是空的，這支測試就失去意義（檢查 dividendYield.EOD 是否還有資料）');
    const q = d.quantiles;
    assert.ok(q, 'totalCount > 0 時 quantiles 不該是 null');
    assert.ok(q!.p20 <= q!.p40 && q!.p40 <= q!.p60 && q!.p60 <= q!.p80, `分位必須單調遞增，實際 ${JSON.stringify(q)}`);
    assert.ok(d.trueMin! <= q!.p20 && q!.p80 <= d.trueMax!, `分位必須落在真實值域內，實際 ${JSON.stringify(q)} vs [${d.trueMin}, ${d.trueMax}]`);
  });

  test('excludeZero 真的有套用到分位（含零母體的分位必定比較低）', async () => {
    const [excluded, included] = await Promise.all([
      getFieldDistribution(FIELD, 25, true, appDeps),
      getFieldDistribution(FIELD, 25, false, appDeps),
    ]);
    assert.ok(included.totalCount > excluded.totalCount, '含零母體應該比較大，否則這個欄位沒有值為 0 的公司、這個斷言無法驗證任何東西');
    // 一大群 0 擠在最低端，把含零母體的每一條分位線都往下拉。這是最便宜也最直接的
    // 「兩支查詢母體不同」偵測：如果 quantiles 漏掉 excludeZero，兩者會完全相等。
    assert.ok(included.quantiles!.p20 < excluded.quantiles!.p20, 'excludeZero 沒有套用到 quantiles（兩種母體算出同一條 p20）');
  });

  test('跟 company-rank 的 quintile 對得起來：quintile 1 的公司，值必定不高於 p20', async () => {
    const d = await getFieldDistribution(FIELD, 25, true, appDeps);
    // 2330 是這個欄位的長期樣本（殖利率相對低，落在最低的五分之一）。萬一哪天它換了分位，
    // 這個測試仍然成立——斷言是照實際回來的 quintile 挑對應的邊界比，不是寫死 2330 在第幾分位。
    const rank = await getCompanyRank('2330', FIELD, 'desc', true, appDeps);
    assert.ok(rank.found && rank.value !== null && rank.quintile !== null, '2330 的 dividendYield.EOD 應該查得到值與 quintile');
    assert.equal(rank.totalCount, d.totalCount, 'company-rank 與 distribution 的母體總數必須一致——不一致代表兩支查詢的篩選條件已經漂開');

    const upperBound = { 1: d.quantiles!.p20, 2: d.quantiles!.p40, 3: d.quantiles!.p60, 4: d.quantiles!.p80, 5: d.trueMax! }[rank.quintile!]!;
    assert.ok(rank.value! <= upperBound, `quintile ${rank.quintile} 的值 ${rank.value} 應該 <= 該等分上界 ${upperBound}`);
  });
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
});
