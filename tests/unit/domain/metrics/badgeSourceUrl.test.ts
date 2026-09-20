import { describe, expect, test } from 'vitest';
import { badgeRegistry } from '@/domain/metrics/badgeRegistry';

// 2026-09-20 使用者回報「徽章連結點過去根本沒看到公式或門檻」，查出根因是 MetricBadge 原本沒有自己的
// 來源連結欄位（前端只能拿指標的 referenceUrl 充數，那個欄位講的是指標定義不是門檻出處）。新增
// badge.sourceUrl 之後用這支測試守住兩件事：
//   1. 有填的必須是 https 公開網址——這個欄位的契約是「使用者點得進去、且頁面上真的有寫出門檻數字」，
//      內部路徑/相對路徑/http 明文一律不合格。
//   2. 只有已知確定沒有合法免費全文的那兩支（門檻出自 Mary Buffett & David Clark 2008 的實體書）
//      允許留空。之後任何新增徽章如果沒填 sourceUrl，這支測試就會紅——強制新增時一起處理來源查證，
//      不會默默累積「掛了名人名字但點不到出處」的徽章（見 metricDefinitionSpec.ts 的欄位說明）。
//
// 刻意不在這裡驗證 URL 活著/內容正確——那需要打外網，會讓單元測試變慢又不穩定。實際 fetch 驗證到的
// 逐字引文記在各 badge 檔案的註解裡，是人工查核的紀錄，不是自動化斷言。
const ALLOWED_WITHOUT_SOURCE_URL = ['grossMargin', 'netProfitMargin'];

describe('badge.sourceUrl', () => {
  test('每支徽章都要有可點擊的門檻出處連結，只有出處是實體書的兩支例外', () => {
    const missing = Object.keys(badgeRegistry).filter((code) => !badgeRegistry[code]!.sourceUrl);
    expect(missing.sort()).toEqual([...ALLOWED_WITHOUT_SOURCE_URL].sort());
  });

  test('有填的 sourceUrl 都是 https 公開網址', () => {
    for (const [code, badge] of Object.entries(badgeRegistry)) {
      if (!badge.sourceUrl) continue;
      expect(badge.sourceUrl, `${code}.sourceUrl`).toMatch(/^https:\/\/\S+$/);
    }
  });
});
