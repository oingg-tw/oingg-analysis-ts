// 批次完整性檢查——BCBS 239 reconciliation 概念的 analysis-ts 版本，跟 docs（Obsidian
// 知識庫維護）討論 BCBS 239 資料血緣/稽核方案後排出的優先序第一步（2026-09-06）。銀行帳務
// 場景比對的是金額/筆數，analysis-ts 沒有金額在移動，這裡比對的是「攻打的公司數 vs 這次
// 批次時間窗內實際被寫入/更新的列數」，讓「資料有沒有真的寫進去」這件事從完全看不見變成
// 至少能在 log 裡看到。
//
// 真正的缺口：runner.ts 的 success/failed 計數只反映 job.run(id) 有沒有 throw，但每支
// domainMetrics/*.ts 的 calculate* 函式，upsert 那段本來就自己包 try/catch 吞掉錯誤（見各
// 檔案「存檔失敗不應該讓已經算好的結果回傳失敗」的既有設計），這代表 DB 寫入本身失敗時，
// 批次仍然會把它算進「成功」。這支檔案從外部（跑完之後查資料表）獨立驗證，不需要 44 支
// 指標配合改自己的回傳值。
//
// 刻意不做：不判斷「這家公司本來就沒資料」跟「應該寫入但失敗」的差異（需要重新設計 44 支
// 指標共通的回傳規範，成本不小，這次不做）；不做告警閾值判斷（沒有歷史基準線可比）；
// 不新增資料庫表（全部落地到既有的 pino 結構化 log，Cloud Logging 已經在收集）。

import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getTableForMetric } from '@/api/bff/filter/metricTableRegistry';
import { logger } from '@/shared/logger';
import type { IndicatorJob } from './indicatorJob';

export interface CompletenessResult {
  metricKey: string;
  attempted: number;
  written: number;
  coverageRatio: number; // written / attempted，attempted 為 0 時視為 1（沒有攻打對象，無所謂完整度）
  skipped?: string; // 有值代表沒做檢查的原因
}

const toAccessorName = (modelName: string): string => modelName.charAt(0).toLowerCase() + modelName.slice(1);

// 已知的精準度限制：(1) 如果批次執行期間剛好有 API compute-on-miss 也在對同一批公司/
// 同一支指標寫入，written 會偏高，這是可接受的雜訊，不影響「覆蓋率長期趨勢異常」這個真正
// 想抓的訊號；(2) coverageRatio 沒有「正常值應該是多少」的基準線（很多公司這一季本來就沒
// 資料是預期現象），這次只負責讓數字可見，判斷趨勢異常是之後的事。
export const checkJobCompleteness = async (job: IndicatorJob, companyIds: string[], batchStartedAt: Date): Promise<CompletenessResult> => {
  const tableInfo = getTableForMetric(job.name);
  if (!tableInfo) {
    return { metricKey: job.name, attempted: companyIds.length, written: 0, coverageRatio: 0, skipped: 'filterCatalog 找不到這個 metricKey，無法解析對應的資料表。' };
  }
  if (companyIds.length === 0) {
    return { metricKey: job.name, attempted: 0, written: 0, coverageRatio: 1 };
  }

  try {
    const accessor = toAccessorName(tableInfo.modelName);
    const written = await (analysisPrisma as unknown as Record<string, { count: (args: unknown) => Promise<number> }>)[accessor]!.count({
      where: { symbol: { in: companyIds }, updatedAt: { gte: batchStartedAt } },
    });
    return { metricKey: job.name, attempted: companyIds.length, written, coverageRatio: written / companyIds.length };
  } catch (error) {
    logger.error({ err: error, metricKey: job.name }, '[completeness-check]: 查詢寫入列數失敗，本次跳過完整性檢查，不影響批次本身結果。');
    return { metricKey: job.name, attempted: companyIds.length, written: 0, coverageRatio: 0, skipped: '查詢失敗，見上一行 log。' };
  }
};
