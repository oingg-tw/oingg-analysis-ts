// 排行榜退化稽核——哪些指標不適合做「前 N 名」排行頁或 percentileRank 徽章。
//
// 判準：取每家公司最新一筆非 null 值，由大到小排前 N 名，看這 N 名總共跨越幾個不同數值。
// 只跨 1~2 個值代表第 k 名之後純粹是並列者裡代號最小的那幾家——排名呈現的是任意子集，不是高低。
//
// 2026-09-22 起因：web-nuxt 撤掉 consecutiveDividendYears 排行頁（889 家並列 5），掃完發現同樣退化的
// 還有 threeMarginsRising／consecutiveProfitYears／piotroskiFScore／dividendDistributionCount。
// 兩種成因要分開看，腳本只報數字不下判斷：
//   (a) 資料深度天花板（連續年數類被 XBRL 109Q3 地板卡住）——會隨資料變深自己好，值得設還原條件。
//   (b) 指標值域本來就只有幾個整數（三率三升 0~3、F-Score 0~9、配息次數 1~4）——永遠不會好。
// 新增指標要上排行榜/percentile 徽章之前先跑這支。
//
// 用法：pnpm tsx scripts/auditRankDegeneracy.ts
//   TOP_N           前幾名，預設 50（對齊 web-nuxt 排行頁的長度）
//   MIN_COMPANIES   少於這個家數的指標不看（母體太小談不上排行），預設 200
//   MAX_DISTINCT    只印出「跨越值數 <= 這個數」的指標，預設 5；設 0 印全部
import 'dotenv/config';
import { analysisQueries } from '../src/bootstrap/scripts';
import { disconnectAllDbs } from '../src/bootstrap/db';

const TOP_N = Number(process.env.TOP_N ?? 50);
const MIN_COMPANIES = Number(process.env.MIN_COMPANIES ?? 200);
const MAX_DISTINCT = Number(process.env.MAX_DISTINCT ?? 5);

void (async () => {
  const rows = await analysisQueries.listRankDegeneracy(TOP_N, MIN_COMPANIES);
  const flagged = MAX_DISTINCT > 0 ? rows.filter((r) => r.distinct_in_top_n <= MAX_DISTINCT) : rows;

  console.log(`前 ${TOP_N} 名跨越值數 <= ${MAX_DISTINCT} 的指標（母體 >= ${MIN_COMPANIES} 家，共掃 ${rows.length} 支）：`);
  console.table(
    flagged.map((r) => ({
      指標: r.metric_code,
      有值家數: r.companies,
      前N名跨幾個值: r.distinct_in_top_n,
      第1名: r.top_value,
      [`第${TOP_N}名`]: r.value_at_n,
    }))
  );
  if (flagged.length === 0) console.log('（沒有退化的指標）');

  await disconnectAllDbs();
})();
