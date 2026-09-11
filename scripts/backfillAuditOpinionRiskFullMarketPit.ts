// auditOpinionRisk 全市場回填——查核意見類型編碼成 0~4 風險分數，見
// computeAuditOpinionRiskPit.ts 檔頭說明。跟其他「最新一季」回填腳本同一個公司清單標準
// （115Q2 dataType='2' 有 XBRL 合併報表資料的公司），但查核意見的來源表
// export.audit_scope_xbrl 是獨立資料源，不保證跟財報同步覆蓋，所以改用
// getLatestQuarterWithAuditOpinionXbrl 各自解析最新可用季度，不強制對齊 115Q2。
//
// 用法：pnpm tsx scripts/backfillAuditOpinionRiskFullMarketPit.ts
//      PILOT_LIMIT=30 pnpm tsx scripts/backfillAuditOpinionRiskFullMarketPit.ts（小批次測試）

import { computeAndWriteAuditOpinionRiskPit } from '../src/domainPitMetrics/resilience/auditOpinionRisk/computeAuditOpinionRiskPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const PROGRESS_EVERY = 50;
const SYMBOL_CONCURRENCY = 8;

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = '115' AND quarter = '2' AND data_type = '2'
    ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const main = async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.auditOpinionRisk!);

  const symbolsFull = await getFullMarketSymbols();
  const PILOT_LIMIT = process.env.PILOT_LIMIT ? Number(process.env.PILOT_LIMIT) : undefined;
  const symbols = PILOT_LIMIT ? symbolsFull.slice(0, PILOT_LIMIT) : symbolsFull;
  console.log(`[audit-opinion-risk-pit] 共 ${symbols.length} 家公司，開始跑 auditOpinionRisk（各自最新一季），併發數 ${SYMBOL_CONCURRENCY}`);

  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; error: unknown }[] = [];

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor]!;
      cursor += 1;
      try {
        await computeAndWriteAuditOpinionRiskPit({ symbol, dataType: '2', subsidiaryCompanyId: '' });
      } catch (error) {
        errors.push({ symbol, error });
        console.error(`[audit-opinion-risk-pit] ${symbol} 失敗：`, error);
      }
      done += 1;

      if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
        const elapsedMs = Date.now() - t0;
        const avgMsPerSymbol = elapsedMs / done;
        const remaining = symbols.length - done;
        const etaMs = avgMsPerSymbol * remaining;
        console.log(
          `[audit-opinion-risk-pit] 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
            ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(SYMBOL_CONCURRENCY, symbols.length) }, () => worker()));

  console.log(`[audit-opinion-risk-pit] 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  if (errors.length > 0) {
    console.log('[audit-opinion-risk-pit] 錯誤清單：', errors.map((e) => e.symbol).join(','));
  }
};

main()
  .catch((error) => {
    console.error('auditOpinionRisk 全市場 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
