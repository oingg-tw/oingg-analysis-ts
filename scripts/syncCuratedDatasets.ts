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

const jobs = [
  { backend: 'mops', dataset: 'quarterly_income_statement', connector: mopsQuarterlyIncomeStatementConnector, target: mopsQuarterlyIncomeStatementTarget },
  { backend: 'gov', dataset: 'monthly_gov_bond_yield_10y', connector: govMonthlyGovBondYield10yConnector, target: govMonthlyGovBondYield10yTarget },
  { backend: 'gov', dataset: 'company_industry_classification', connector: govCompanyIndustryClassificationConnector, target: govCompanyIndustryClassificationTarget },
];

const main = async () => {
  for (const job of jobs) {
    console.log(`[${job.backend}/${job.dataset}] 開始同步`);
    const result = await syncDataset(job.backend, job.dataset, job.connector, job.target, prismaWatermarkStore);
    const synced = result.outcomes.filter((o) => o.status === 'synced').length;
    const failed = result.outcomes.filter((o) => o.status !== 'synced');
    console.log(`[${job.backend}/${job.dataset}] 完成：${result.outcomes.length} 個批次，成功 ${synced}，失敗/不符 ${failed.length}${failed.length > 0 ? `（${failed.map((f) => f.message).join('; ')}）` : ''}`);
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
