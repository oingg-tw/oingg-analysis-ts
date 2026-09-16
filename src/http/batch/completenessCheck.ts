// 批次完整性檢查——BCBS 239 reconciliation 概念的 analysis-ts 版本，跟 docs（Obsidian
// 知識庫維護）討論 BCBS 239 資料血緣/稽核方案後排出的優先序第一步（2026-09-06）。銀行帳務
// 場景比對的是金額/筆數，analysis-ts 沒有金額在移動，這裡比對的是「攻打的公司數 vs 這次
// 批次時間窗內實際被寫入/更新的列數」，讓「資料有沒有真的寫進去」這件事從完全看不見變成
// 至少能在 log 裡看到。
//
// 真正的缺口：runner.ts 的 success/failed 計數只反映 job.run(id) 有沒有 throw，但每支
// pitMetrics/**/computeXxxPit.ts 的 calculate* 函式，upsert 那段本來就自己包 try/catch 吞掉
// 錯誤（見各檔案「存檔失敗不應該讓已經算好的結果回傳失敗」的既有設計），這代表 DB 寫入本身
// 失敗時，批次仍然會把它算進「成功」。這支檔案從外部（跑完之後查資料表）獨立驗證，不需要
// 全部指標配合改自己的回傳值。
//
// 刻意不做：不判斷「這家公司本來就沒資料」跟「應該寫入但失敗」的差異（需要重新設計指標
// 共通的回傳規範，成本不小，這次不做）；不做告警閾值判斷（沒有歷史基準線可比）；
// 不新增資料庫表（全部落地到既有的 pino 結構化 log，Cloud Logging 已經在收集）。
//
// 2026-09-08：舊架構「每指標一張獨立 Result 表」的 model 已經全部退場（連同
// filterCatalog.ts/metricTableRegistry.ts 這套解析機制一起刪除，見
// abstract-crafting-journal.md），現在全部指標都走 pitMetrics 共用的表，用 metricCode
// 欄位分辨——用 computedAt 判斷寫入時間，不是 updatedAt（那個欄位不存在）。
//
// 2026-09-09：pitMetrics 現在拆成兩張表——季報型指標查 metric_values、逐日型指標（beta/
// exchangePeRatio 等）查 metric_daily_cadence_values（見 abstract-crafting-journal.md
// 的拆表決策）。目前 dailyIndicatorJobs（src/api/batch/daily/indicatorRegistry.ts）是
// 空陣列，還沒有任何批次 job 用逐日型 metricCode 呼叫這支函式，但這裡還是先補上表路由，
// 避免之後真的有人註冊逐日型 job 時悄悄查錯表（查 metric_values 永遠 written=0，
// coverageRatio 永遠 0，會誤判成「這支指標完全沒寫入」）。

import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { logger } from '@/infrastructure/logger';
import type { IndicatorJob } from './indicatorJob';

export interface CompletenessResult {
  metricKey: string;
  attempted: number;
  written: number;
  coverageRatio: number; // written / attempted，attempted 為 0 時視為 1（沒有攻打對象，無所謂完整度）
  skipped?: string; // 有值代表沒做檢查的原因
}

// 已知的精準度限制：(1) 如果批次執行期間剛好有 API compute-on-miss 也在對同一批公司/
// 同一支指標寫入，written 會偏高，這是可接受的雜訊，不影響「覆蓋率長期趨勢異常」這個真正
// 想抓的訊號；(2) coverageRatio 沒有「正常值應該是多少」的基準線（很多公司這一季本來就沒
// 資料是預期現象），這次只負責讓數字可見，判斷趨勢異常是之後的事。
export const checkJobCompleteness = async (job: IndicatorJob, companyIds: string[], batchStartedAt: Date): Promise<CompletenessResult> => {
  if (companyIds.length === 0) {
    return { metricKey: job.name, attempted: 0, written: 0, coverageRatio: 1 };
  }

  if (!(job.name in metricDefinitionRegistry)) {
    return { metricKey: job.name, attempted: companyIds.length, written: 0, coverageRatio: 0, skipped: `"${job.name}" 不是已註冊的 pitMetrics metricCode（metricDefinitionRegistry.ts 找不到），無法查詢對應的寫入紀錄。` };
  }

  try {
    const definition = metricDefinitionRegistry[job.name]!;
    const isDailyCadence = definition.group !== 'period';
    const written = isDailyCadence
      ? await analysisPrisma.metricDailyCadenceValue.count({ where: { metricCode: job.name, symbol: { in: companyIds }, computedAt: { gte: batchStartedAt } } })
      : await analysisPrisma.metricValue.count({ where: { metricCode: job.name, symbol: { in: companyIds }, computedAt: { gte: batchStartedAt } } });
    return { metricKey: job.name, attempted: companyIds.length, written, coverageRatio: written / companyIds.length };
  } catch (error) {
    logger.error({ err: error, metricKey: job.name }, '[completeness-check]: 查詢寫入列數失敗，本次跳過完整性檢查，不影響批次本身結果。');
    return { metricKey: job.name, attempted: companyIds.length, written: 0, coverageRatio: 0, skipped: '查詢失敗，見上一行 log。' };
  }
};
