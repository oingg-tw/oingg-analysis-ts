import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { ReportAvailabilityPort } from '@/application/ports/reportAvailability';
import type { StatementDataType } from '@/domain/financials/quarterlyMetric';

// mops-ts 2026-09-22 開的 export.company_report_availability：一列一家，欄位 symbol / has_consolidated /
// has_individual / latest_consolidated_yq / latest_individual_yq / earliest_* / *_quarters（yq = 民國年×10＋季）。
// 以損益表核心表、公司本身列為準，金控子公司列排除。2026-09-22 實測：只有合併 2,000 家、只有個體 249 家、
// 兩種都有 90 家。
//
// ponytail: 整張表一次載進記憶體（2,339 列），process 存活期間不重載——新上市公司或公司從個體轉合併
// （取得第一家子公司）要重啟 process 才看得到。回填腳本每次都是新 process；長駐的 HTTP server 讀取端拿到
// 過期口徑的後果只是「查不到列」（跟今天的行為一樣），不會拿錯數字。之後若要即時，升級成 startupCache
// 那種有 reload 的 lifecycle。
let cache: Promise<Map<string, StatementDataType>> | null = null;

const load = (): Promise<Map<string, StatementDataType>> =>
  mopsExportPrisma
    .$queryRaw<{ symbol: string; has_consolidated: boolean; has_individual: boolean }[]>`
      SELECT symbol, has_consolidated, has_individual FROM "export"."company_report_availability"
    `
    .then((rows) => new Map(rows.filter((r) => r.has_consolidated || r.has_individual).map((r) => [r.symbol, r.has_consolidated ? '2' : '1'])));

export const mopsReportAvailability: ReportAvailabilityPort = {
  resolveDataType: async (symbol) => {
    cache ??= load().catch((error: unknown) => {
      cache = null; // 載入失敗不要把 rejected promise 留著，下一次呼叫重試。
      throw error;
    });
    return (await cache).get(symbol) ?? '2';
  },
};
