import { test, describe, afterAll, expect } from 'vitest';
import assert from 'node:assert/strict';
import { computeIncomeStatementPerShare } from '@/application/metrics/profitability/incomeStatementPerShare/computeIncomeStatementPerShare';
import { computeEps } from '@/application/metrics/profitability/eps/computeEps';
import { computeRevenuePerShare } from '@/application/metrics/profitability/revenuePerShare/computeRevenuePerShare';
import { pitDeps } from '@/bootstrap/pitDeps';
import { appDeps } from '@/bootstrap/deps';
import { isComputationSkip, type ComputationSlot } from '@/domain/metrics/computation';
import { disconnectAllDbs } from '@/bootstrap/db';

// 2026-09-24「營收 → 現金股利」瀑布圖的守門測試。
//
// 這支測試守的不是「每個指標各自算得出數字」（那個各自的單元測試在管），而是**整條鏈的加總
// 恆等式**：每一層的子項相加必須還原成上一層的總額。這是新增這 11 個 metric_code 的唯一目的——
// 如果某一格算錯、或某人之後把某個 pick 改指到別的 XBRL 科目，單支指標仍然會有一個看起來合理
// 的數字，只有恆等式會垮。**錯誤的結果看起來完全合理**是這個 repo 這週最貴的教訓。
//
// 容差：每股金額四捨五入到小數第 2 位（toPerShare），所以每一項有 ±0.005 的捨入。最長的恆等式
// 有 5 項，取 0.03 作為容差上限。不是「大約相等就好」，是「捨入以外不容許任何差異」。
//
// 每個恆等式都會計數實際驗證過幾次，最後斷言 > 0——**全部被 null 跳過的恆等式等於沒測到**，
// 那種靜默通過比失敗更危險（今天已經被一個回 0 的探針騙過一次）。

const SYMBOLS = ['2330', '2317', '2454', '1301', '2412', '1101', '6415', '2308'];
const QUARTERS: [string, '1' | '2' | '3' | '4'][] = [['115', '2'], ['115', '1'], ['114', '4']];
const TOLERANCE = 0.03;

const valueOf = (slot: ComputationSlot | undefined): number | null =>
  slot && !isComputationSkip(slot) ? slot.value : null;

interface Identity {
  name: string;
  /** 正項的 slot 名稱；任一為 null 就整條跳過（缺了就不成立） */
  plus: string[];
  /** 負項的 slot 名稱 */
  minus: string[];
  /**
   * 選填正項：null 視為 0，不會讓整條恆等式跳過。
   * 用在「大多數公司沒有這個科目、沒有就是 0」的項目——IFRS 9 預期信用減損（1,445/2,335 家揭露）
   * 與其他營業收益費損淨額（約 5%）。若當成必填，恆等式會在絕大多數公司身上被跳過而形同沒測。
   */
  optionalPlus?: string[];
  /** 應該等於的 slot 名稱 */
  equals: string;
}

const identitiesFor = (suffix: 'Q' | 'Ttm'): Identity[] => [
  {
    name: '推銷 + 管理 + 研發 + 預期信用減損 = 營業費用',
    plus: [`sellingExpensePerShare${suffix}`, `administrativeExpensePerShare${suffix}`, `researchAndDevelopmentExpensePerShare${suffix}`],
    optionalPlus: [`expectedCreditLossPerShare${suffix}`],
    minus: [],
    equals: `operatingExpensePerShare${suffix}`,
  },
  {
    name: '毛利 − 營業費用 + 其他營業收益費損 = 營業利益',
    plus: [`grossProfitPerShare${suffix}`],
    optionalPlus: [`otherOperatingIncomeExpensePerShare${suffix}`],
    minus: [`operatingExpensePerShare${suffix}`],
    equals: `operatingIncomePerShare${suffix}`,
  },
  {
    name: '利息收入 + 其他收入 + 其他利益損失 + 權益法 − 財務成本 = 業外損益',
    plus: [`interestIncomePerShare${suffix}`, `otherIncomePerShare${suffix}`, `otherGainsLossesPerShare${suffix}`, `equityMethodIncomePerShare${suffix}`],
    minus: [`financeCostPerShare${suffix}`],
    equals: `nonOperatingIncomePerShare${suffix}`,
  },
];

describe('營收→股利瀑布圖：每一層加總都要還原', () => {
  for (const suffix of ['Q', 'Ttm'] as const) {
    test(`${suffix === 'Q' ? '單季' : '近四季'}的三條加總恆等式`, async () => {
      const checkedCount = new Map<string, number>();
      const failures: string[] = [];

      for (const symbol of SYMBOLS) {
        const dataType = await appDeps.reportAvailability.resolveDataType(symbol);
        for (const [year, season] of QUARTERS) {
          const { slots } = await computeIncomeStatementPerShare({ symbol, year, season, dataType, subsidiaryCompanyId: '' }, pitDeps);

          for (const identity of identitiesFor(suffix)) {
            const terms = [...identity.plus, ...identity.minus, identity.equals].map((s) => valueOf(slots[s as keyof typeof slots]));
            // 必填項任一為 null（該公司沒有揭露這個科目）就跳過——恆等式在缺項時本來就不成立。
            if (terms.some((t) => t === null)) continue;

            const sum =
              identity.plus.reduce((acc, s) => acc + valueOf(slots[s as keyof typeof slots])!, 0) +
              (identity.optionalPlus ?? []).reduce((acc, s) => acc + (valueOf(slots[s as keyof typeof slots]) ?? 0), 0) -
              identity.minus.reduce((acc, s) => acc + valueOf(slots[s as keyof typeof slots])!, 0);
            const actual = valueOf(slots[identity.equals as keyof typeof slots])!;
            const diff = Math.abs(sum - actual);

            checkedCount.set(identity.name, (checkedCount.get(identity.name) ?? 0) + 1);
            if (diff > TOLERANCE) failures.push(`${symbol} ${year}Q${season} 「${identity.name}」：算出 ${sum.toFixed(2)} vs 實際 ${actual.toFixed(2)}，差 ${diff.toFixed(2)}`);
          }
        }
      }

      assert.deepEqual(failures, [], `有恆等式不成立：\n${failures.join('\n')}`);
      for (const identity of identitiesFor(suffix)) {
        assert.ok(
          (checkedCount.get(identity.name) ?? 0) > 0,
          `「${identity.name}」一次都沒驗到（全部被 null 跳過）——這條恆等式等於沒測，要換樣本公司`
        );
      }
    }, 120_000);
  }

  // 整條鏈的端點對端點：營收一路減到 EPS。這條橫跨三支不同的 compute，
  // 是「瀑布圖的第一格與最後一格對得起來」的唯一證明。
  test('TTM：營收 − 成本 − 費用 + 其他 + 業外 − 所得稅 − 少數股東 = EPS', async () => {
    let checked = 0;
    const failures: string[] = [];

    for (const symbol of SYMBOLS) {
      const dataType = await appDeps.reportAvailability.resolveDataType(symbol);
      const query = { symbol, year: '115', season: '2' as const, dataType, subsidiaryCompanyId: '' };
      const [{ slots }, epsBatch, revenueBatch] = await Promise.all([
        computeIncomeStatementPerShare(query, pitDeps),
        computeEps(query, pitDeps),
        computeRevenuePerShare(query, pitDeps),
      ]);

      const revenue = valueOf(revenueBatch.slots.ttm);
      const eps = valueOf(epsBatch.slots.ttm);
      const required = ['costOfGoodsSoldPerShareTtm', 'operatingExpensePerShareTtm', 'nonOperatingIncomePerShareTtm', 'incomeTaxExpensePerShareTtm', 'minorityInterestPerShareTtm']
        .map((s) => valueOf(slots[s as keyof typeof slots]));
      // 其他營業收益費損只有約 5% 的公司揭露，缺了視為 0（見 Identity.optionalPlus 的說明）。
      const otherOperating = valueOf(slots.otherOperatingIncomeExpensePerShareTtm) ?? 0;
      if (revenue === null || eps === null || required.some((p) => p === null)) continue;

      const [cogs, opex, nonOperating, tax, minority] = required as number[];
      const derived = revenue - cogs! - opex! + otherOperating + nonOperating! - tax! - minority!;
      checked++;
      // 7 項相加，容差放寬到 0.05（每項 ±0.005 的捨入）。
      if (Math.abs(derived - eps) > 0.05) failures.push(`${symbol}：推導 ${derived.toFixed(2)} vs eps ${eps.toFixed(2)}，差 ${Math.abs(derived - eps).toFixed(2)}`);
    }

    assert.deepEqual(failures, [], `營收推不回 EPS：\n${failures.join('\n')}`);
    expect(checked, '一家都沒驗到——樣本公司都缺某個科目，這條測試等於沒跑').toBeGreaterThan(0);
  }, 120_000);
});

afterAll(async () => {
  await disconnectAllDbs();
});
