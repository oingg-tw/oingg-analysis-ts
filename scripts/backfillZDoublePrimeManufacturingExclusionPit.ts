// 2026-09-13 web-nuxt 回報：台積電(2330，製造業)畫面上同時顯示 Altman Z-Score 跟
// Z″-Score 兩個徽章都「已達成」。查證後確認：computeAltmanZDoublePrimeScorePit.ts 本來就有
// 製造業排除邏輯（財政部稅籍 section_code='C' 就標記 not_applicable_industry，見該檔案
// 2026-09-13 的說明——Z″ 是 Altman 1983/1995 專門給非製造業/新興市場設計的四變數版本，
// 拿掉了原始論文認為在非製造業間差異過大的 X5 資產週轉率），但這個邏輯是這學期才加上去，
// 從沒對全市場製造業公司重算過——2330 的 section_code 實測是 'C'，DB 裡卻還是舊值
// （value: 8.25, nullReason: null），是跟先前金融業排除同一類「邏輯已修但沒 backfill」的
// 資料落後問題，不是新 bug。
//
// 這支腳本用 export.company_industry_classification（section_code='C' AND rank=0）直接
// 查全市場製造業公司清單，只重算 altmanZDoublePrimeScore 這一支（Z/M-Score/O-Score/
// Zmijewski 都只排除金融業，沒有製造業限制，不受影響，不需要重算）。
//
// 用法：pnpm tsx scripts/backfillZDoublePrimeManufacturingExclusionPit.ts
import { computeAndWriteAltmanZDoublePrimeScorePit } from '../src/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { govExportPrisma } from '../src/infrastructure/prisma/govExportClient';
import { mopsExportPrisma } from '../src/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/infrastructure/prisma/twseExportClient';
import tpexExportPrisma from '../src/infrastructure/prisma/tpexExportClient';
import { analysisPrisma } from '../src/infrastructure/prisma/analysisClient';

const SYMBOL_CONCURRENCY = 8;

const getManufacturingSymbols = async (): Promise<string[]> => {
  const rows = await govExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."company_industry_classification" WHERE section_code = 'C' AND rank = 0 ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.altmanZDoublePrimeScore!);

  const symbols = await getManufacturingSymbols();
  console.log(`[z-double-prime-manufacturing-exclusion-pit] 製造業（section=C）共 ${symbols.length} 家，開始重算 altmanZDoublePrimeScore`);

  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; message: string }[] = [];

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        await computeAndWriteAltmanZDoublePrimeScorePit({ symbol, dataType: '2', subsidiaryCompanyId: '' });
      } catch (error) {
        errors.push({ symbol, message: error instanceof Error ? error.message : String(error) });
        console.error(`[z-double-prime-manufacturing-exclusion-pit] ${symbol} 失敗：`, error);
      }
      done += 1;
      if (done % 200 === 0 || done === symbols.length) {
        console.log(`[z-double-prime-manufacturing-exclusion-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%），錯誤 ${errors.length} 筆`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[z-double-prime-manufacturing-exclusion-pit] 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  if (errors.length > 0) {
    console.log('[z-double-prime-manufacturing-exclusion-pit] 失敗公司：', errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('Z″-Score 製造業排除邏輯 backfill 執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await govExportPrisma.$disconnect();
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await tpexExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
