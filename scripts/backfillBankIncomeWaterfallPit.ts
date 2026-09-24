// 2026-09-15：bankNetInterestIncomePerShare/bankNetNonInterestIncomePerShare/
// bankBadDebtProvisionPerShare/bankOtherOperatingExpensePerShare 上線後的首次回填，
// 單一任務，不用跑 backfillAllMetricsLatestFullMarketPit.ts 整套。
//
// 銀行清單用損益表明細（bank_income_statement_detail_xbrl 的
// net_income_loss_of_interest_quarter IS NOT NULL），不是資本適足率揭露。
//
// 2026-09-24 更新：這段原本寫「刻意不沿用 backfillAllMetricsLatestFullMarketPit.ts 的
// getBankSymbols()」——當時那份清單只查資本適足率，會漏掉「有銀行損益表但不申報資本適足率」
// 的公司（實例：2820 華票，票券公司）。**那個分歧已經不存在了**：listBankSymbols() /
// listBankSymbolsForQuarter() 已改成兩張表的聯集，所以現在兩邊母體一致。
//
// 這支腳本保留的理由變成「只跑 bankIncomeWaterfall 這一個 label 的快速通道」，
// 不再是因為母體不同。
//
// 教訓留著：當時是在**這一支**繞過問題而不是修母體函式，結果另外三支選母體的腳本
// （AllMetricsLatest / FullHistory / scanMetricGaps）繼續用錯的清單，2820 從來沒被算過，
// 直到 2026-09-24 bff-ts 回報銀行指標覆蓋率才發現。繞道會留在原地。
//
// 用法：pnpm tsx scripts/backfillBankIncomeWaterfallPit.ts
import { computeAndWriteBankIncomeWaterfallPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { backfillUniverse, reportAvailability } from '../src/bootstrap/scripts';
import { disconnectAllDbs } from '../src/bootstrap/db';

const getBankIncomeStatementSymbols = async (): Promise<string[]> => {
  const rows = await backfillUniverse.listSymbolsWithBankIncomeStatement();
  return rows.map((r) => r.symbol);
};

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.bankNetInterestIncomePerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankNetNonInterestIncomePerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankBadDebtProvisionPerShare!);
  await upsertMetricDefinition(metricDefinitionRegistry.bankOtherOperatingExpensePerShare!);

  const symbols = await getBankIncomeStatementSymbols();
  console.log(`[bank-income-waterfall-pit] 共 ${symbols.length} 家銀行/金控：${symbols.join(', ')}`);

  const errors: { symbol: string; message: string }[] = [];
  const actionCounts: Record<string, number> = {};

  for (const symbol of symbols) {
    try {
      const outcome = await computeAndWriteBankIncomeWaterfallPit({ symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' });
      const action = outcome.bankNetInterestIncomePerShareQ.action;
      actionCounts[action] = (actionCounts[action] ?? 0) + 1;
      console.log(`[bank-income-waterfall-pit] ${symbol}: ${JSON.stringify(outcome)}`);
    } catch (error) {
      errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
      console.error(`[bank-income-waterfall-pit] ${symbol} 失敗：`, error);
    }
  }

  console.log(`[bank-income-waterfall-pit] 完成，共 ${symbols.length} 家，action 統計：`, actionCounts);
  if (errors.length > 0) {
    console.log(`[bank-income-waterfall-pit] 錯誤 ${errors.length} 筆：`, errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('[bank-income-waterfall-pit] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
