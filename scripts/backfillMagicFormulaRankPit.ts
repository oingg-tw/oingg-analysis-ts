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
import { computeAndWriteGreenblattEarningsYieldPit, computeAndWriteGreenblattRocPit } from '../src/bootstrap/pitMetrics';
import { metricDefinitionRegistry, upsertMetricDefinition } from '../src/bootstrap/metricDefinitions';
import { backfillUniverse, reportAvailability } from '../src/bootstrap/scripts';
import { rankAndWriteMagicFormula } from './magicFormulaRank';
import { disconnectAllDbs } from '../src/bootstrap/db';

const SYMBOL_CONCURRENCY = 8;


const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await backfillUniverse.listSymbolsWithIncomeStatement('115', '2');
  return rows.map((r) => r.symbol);
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
        const query = { symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' };
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

  console.log('[magic-formula-rank-pit] 步驟2-3：查全市場最新 TTM 值、排名並寫入（共用 scripts/magicFormulaRank.ts）');
  const ranked = await rankAndWriteMagicFormula('[magic-formula-rank-pit]');
  console.log(`[magic-formula-rank-pit] 完成，寫入 ${ranked.written} 家，${ranked.rejected} 家因故跳過 ${JSON.stringify(ranked.actions)}`);
};

main()
  .catch((error) => {
    console.error('[magic-formula-rank-pit] 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectAllDbs();
  });
