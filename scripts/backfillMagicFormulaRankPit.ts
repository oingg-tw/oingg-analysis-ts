// 2026-09-15：Joel Greenblatt 神奇公式（Magic Formula Investing）上線首次回填。
// magicFormulaRank 不是逐一公司獨立算出來的指標——是全市場橫斷面排名（greenblattRoc/
// greenblattEarningsYield 各自在全市場排名，兩個名次相加），沒有對應的
// computeAndWriteMagicFormulaRankPit(symbol) 這種單一公司函式，這支腳本本身就是
// 「計算」邏輯所在，不是單純的回填包裝，之後要重算（例如季度更新）也是重跑這支腳本，
// 不是走一般的 buildGeneralTasks 逐一公司路徑。
//
// 流程：
// 1. 先確保 greenblattRoc/greenblattEarningsYield 兩支底層指標是全市場最新資料
//    （重新跑一次逐一公司計算，冪等安全，不是問題）。
// 2. 查兩支指標全市場最新一筆 TTM 值（DISTINCT ON (symbol) 取每家公司最新
//    knowledge_date，跟 screener queryBuilder.ts 的既有 SQL pattern 一致）。
// 3. 排除金融保險業（isFinancialIndustryCompany，跟兩支底層指標排除範圍一致）、
//    排除任一指標為 null 的公司（不寫入 magicFormulaRank，不是寫 value:null）。
// 4. 各自排名（數值越高名次越前面，ties 用穩定排序不特別處理並列名次，這是業界常見
//    的簡化，不是 Greenblatt 原書逐一討論的精確並列規則）後相加，寫入 magicFormulaRank。
//
// 用法：pnpm tsx scripts/backfillMagicFormulaRankPit.ts

import { computeAndWriteGreenblattRocPit } from '../src/application/metrics/profitability/greenblattRoc/computeGreenblattRocPit';
import { computeAndWriteGreenblattEarningsYieldPit } from '../src/application/metrics/valuation/greenblattEarningsYield/computeGreenblattEarningsYieldPit';
import { isFinancialIndustryCompany } from '../src/infrastructure/repositories/exchange/securitiesIndustry';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { writeMetricValue, periodTypeGroup } from '../src/application/metrics/metricValueWriter';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import tpexExportPrisma from '../src/infrastructure/prisma/tpexExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOL_CONCURRENCY = 8;

interface LatestMetricRow {
  symbol: string;
  value: number;
  fiscal_year: number;
  fiscal_quarter: number;
  knowledge_date: Date;
  knowledge_date_is_fallback: boolean;
}

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = '115' AND quarter = '2' AND data_type = '2'
    ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const getLatestMetricValues = async (metricCode: string): Promise<Map<string, LatestMetricRow>> => {
  const rows = await analysisPrisma.$queryRaw<LatestMetricRow[]>`
    SELECT DISTINCT ON (symbol) symbol, value::float AS value, fiscal_year, fiscal_quarter, knowledge_date, knowledge_date_is_fallback
    FROM metric_values
    WHERE metric_code = ${metricCode} AND period_type = 'TTM' AND data_type = '2' AND subsidiary_company_id = '' AND value IS NOT NULL
    ORDER BY symbol, fiscal_year DESC, fiscal_quarter DESC, knowledge_date DESC
  `;
  return new Map(rows.map((r) => [r.symbol, r]));
};

// 數值越高名次越前面（1 = 表現最好），跟 Greenblatt 原始方法一致；並列名次不特別處理，
// 用穩定排序後的序位當名次（ties 直接用先出現的排序位置，不做業界常見的「同分同名次、
// 下一名跳號」精細處理，這是業界常見的簡化）。
const rankDescending = (entries: [string, number][]): Map<string, number> => {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const rankMap = new Map<string, number>();
  sorted.forEach(([symbol], index) => rankMap.set(symbol, index + 1));
  return rankMap;
};

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.greenblattRoc!);
  await upsertMetricDefinition(metricDefinitionRegistry.greenblattEarningsYield!);
  await upsertMetricDefinition(metricDefinitionRegistry.magicFormulaRank!);

  const symbols = await getFullMarketSymbols();
  console.log(`[magic-formula-rank-pit] 步驟1/3：重算全市場 greenblattRoc/greenblattEarningsYield，共 ${symbols.length} 家，併發數 ${SYMBOL_CONCURRENCY}`);

  let done = 0;
  let cursor = 0;
  const errors: { symbol: string; message: string }[] = [];
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
        await Promise.all([computeAndWriteGreenblattRocPit(query), computeAndWriteGreenblattEarningsYieldPit(query)]);
      } catch (error) {
        errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
      }
      done += 1;
      if (done % 200 === 0 || done === symbols.length) {
        console.log(`[magic-formula-rank-pit] 進度 ${done}/${symbols.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));
  console.log(`[magic-formula-rank-pit] 步驟1完成，錯誤 ${errors.length} 筆${errors.length > 0 ? '：' + errors.map((e) => e.symbol).join(',') : ''}`);

  console.log('[magic-formula-rank-pit] 步驟2/3：查全市場最新 TTM 值，排除金融保險業與任一指標為 null 的公司');
  const [rocValues, eyValues] = await Promise.all([getLatestMetricValues('greenblattRoc'), getLatestMetricValues('greenblattEarningsYield')]);

  const eligibleSymbols = [...rocValues.keys()].filter((s) => eyValues.has(s));
  const financialFlags = await Promise.all(eligibleSymbols.map((s) => isFinancialIndustryCompany(s)));
  const rankableSymbols = eligibleSymbols.filter((_, i) => !financialFlags[i]);
  console.log(`[magic-formula-rank-pit] 兩指標皆非null：${eligibleSymbols.length} 家，排除金融保險業後可排名：${rankableSymbols.length} 家`);

  const rocRank = rankDescending(rankableSymbols.map((s) => [s, rocValues.get(s)!.value]));
  const eyRank = rankDescending(rankableSymbols.map((s) => [s, eyValues.get(s)!.value]));

  console.log('[magic-formula-rank-pit] 步驟3/3：寫入 magicFormulaRank');
  let inserted = 0;
  let skippedNoKnowledgeDate = 0;
  for (const symbol of rankableSymbols) {
    const combinedRank = rocRank.get(symbol)! + eyRank.get(symbol)!;
    // 用 greenblattRoc 那一筆的座標當這一列的 fiscalYear/fiscalQuarter/knowledgeDate
    // （兩支底層指標理論上會落在同一季，這裡固定取其中一支當錨點，避免兩支座標不一致
    // 時無所適從——如果之後發現兩支經常落在不同季，要再檢討這個簡化）。
    const roc = rocValues.get(symbol)!;
    const outcome = await writeMetricValue({
      symbol,
      metricCode: 'magicFormulaRank',
      ...periodTypeGroup('TTM'),
      fiscalYear: roc.fiscal_year,
      fiscalQuarter: roc.fiscal_quarter,
      dataType: '2',
      subsidiaryCompanyId: '',
      value: combinedRank,
      nullReason: null,
      knowledgeDate: roc.knowledge_date,
      knowledgeDateIsFallback: roc.knowledge_date_is_fallback,
    });
    if (outcome.action === 'rejected') skippedNoKnowledgeDate += 1;
    else inserted += 1;
  }
  console.log(`[magic-formula-rank-pit] 完成，寫入 ${inserted} 家，${skippedNoKnowledgeDate} 家因故跳過`);
};

main()
  .catch((error) => {
    console.error('[magic-formula-rank-pit] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([mopsExportPrisma.$disconnect(), twseExportPrisma.$disconnect(), tpexExportPrisma.$disconnect(), analysisPrisma.$disconnect()]);
  });
