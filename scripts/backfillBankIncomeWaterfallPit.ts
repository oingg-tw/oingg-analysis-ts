// 2026-09-15：bankNetInterestIncomePerShare/bankNetNonInterestIncomePerShare/
// bankBadDebtProvisionPerShare/bankOtherOperatingExpensePerShare 上線後的首次回填，
// 單一任務，不用跑 backfillAllMetricsLatestFullMarketPit.ts 整套。
//
// 銀行清單刻意不沿用 backfillAllMetricsLatestFullMarketPit.ts 的 getBankSymbols()
// （那份清單查的是 bank_capital_adequacy_detail_xbrl 的 eligible_capital IS NOT NULL，
// 只覆蓋 6-7 家有申報資本適足率監理揭露的銀行）——這裡的資料源是損益表明細
// bank_income_statement_detail_xbrl，覆蓋範圍不同（已跟 mops-ts 驗證約 10-11 家），
// 用同一張表自己的 net_income_loss_of_interest_quarter IS NOT NULL 當銀行清單依據，
// 才不會漏掉「有損益表資料但沒有資本適足率監理揭露」的銀行/金控。
//
// 用法：pnpm tsx scripts/backfillBankIncomeWaterfallPit.ts
import { computeAndWriteBankIncomeWaterfallPit } from '../src/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import tpexExportPrisma from '../src/infrastructure/prisma/tpexExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const getBankIncomeStatementSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_income_statement_detail_xbrl"
    WHERE net_income_loss_of_interest_quarter IS NOT NULL
    ORDER BY symbol
  `;
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
      const outcome = await computeAndWriteBankIncomeWaterfallPit({ symbol, dataType: '2', subsidiaryCompanyId: '' });
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
    await Promise.all([mopsExportPrisma.$disconnect(), twseExportPrisma.$disconnect(), tpexExportPrisma.$disconnect(), analysisPrisma.$disconnect()]);
  });
