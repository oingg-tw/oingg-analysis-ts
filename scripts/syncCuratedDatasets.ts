// 把各後台 export schema 的新批次同步進本服務的 curated 層——目前這三個 dataset
// （mops quarterly_income_statement、gov monthly_gov_bond_yield_10y、
// gov company_industry_classification）都定義好了 connector/target，但一直沒有實際觸發過
// （2026-09-01 盤點才發現：sync_state 表是空的，代表這幾個 curated 表從來沒被真的同步填過）。
// 跟 batch:compute 同樣的觸發方式：手動跑，不開 HTTP 端點，排程怎麼接是驗證過後的下一步。

import { syncDataset } from '../src/shared/sync/syncDataset';
import { prismaWatermarkStore } from '../src/shared/sync/prismaWatermarkStore';
import { mopsQuarterlyIncomeStatementConnector, mopsQuarterlyIncomeStatementTarget } from '../src/shared/sync/mopsQuarterlyIncomeStatementSync';
import { govMonthlyGovBondYield10yConnector, govMonthlyGovBondYield10yTarget } from '../src/shared/sync/govMonthlyGovBondYield10ySync';
import { govCompanyIndustryClassificationConnector, govCompanyIndustryClassificationTarget } from '../src/shared/sync/govCompanyIndustryClassificationSync';
import prisma from '../src/adapters/prisma/index';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { govExportPrisma } from '../src/adapters/prisma/govExportClient';
import type { SyncResult } from '../src/shared/sync/types';

// 用 thunk（不是資料物件陣列）包每個 job——不同 dataset 的 connector/target Row 型別不一樣，
// 放進同一個陣列會讓 TypeScript 沒辦法各自對應 syncDataset<Row> 的泛型參數，包成各自捕捉好
// 型別的函式就沒有這個問題。
const jobs: { label: string; run: () => Promise<SyncResult> }[] = [
  { label: 'mops/quarterly_income_statement', run: () => syncDataset('mops', 'quarterly_income_statement', mopsQuarterlyIncomeStatementConnector, mopsQuarterlyIncomeStatementTarget, prismaWatermarkStore) },
  { label: 'gov/monthly_gov_bond_yield_10y', run: () => syncDataset('gov', 'monthly_gov_bond_yield_10y', govMonthlyGovBondYield10yConnector, govMonthlyGovBondYield10yTarget, prismaWatermarkStore) },
  { label: 'gov/company_industry_classification', run: () => syncDataset('gov', 'company_industry_classification', govCompanyIndustryClassificationConnector, govCompanyIndustryClassificationTarget, prismaWatermarkStore) },
];

const main = async () => {
  for (const job of jobs) {
    console.log(`[${job.label}] 開始同步`);
    const result = await job.run();
    const synced = result.outcomes.filter((o) => o.status === 'synced').length;
    const failed = result.outcomes.filter((o) => o.status !== 'synced');
    console.log(`[${result.backend}/${result.dataset}] 完成：${result.outcomes.length} 個批次，成功 ${synced}，失敗/不符 ${failed.length}${failed.length > 0 ? `（${failed.map((f) => f.message).join('; ')}）` : ''}`);
  }

  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
  await mopsExportPrisma.$disconnect();
  await govExportPrisma.$disconnect();
};

main().catch((error) => {
  console.error('curated 層同步腳本執行失敗：', error);
  process.exit(1);
});
