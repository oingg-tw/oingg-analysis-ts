import type { MetricDefinitionSpec } from './metricDefinitionSpec';
import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence } from './metricBasis';
import { periodTypeGroup, rollingWindowGroup, snapshotCadenceGroup } from './coordinate';

// 2026-09-17 clean architecture 重構 Phase 1：「metricCode.timeframe」裡 timeframe 那一半的
// 解析規則，從 http/modules/screener/fieldResolver.ts 抽成純函式——它只看 definition.group
// 跟 allowed* 清單，跟 HTTP 或 DB 都無關，卻原本住在 HTTP 層，害 application 的
// fetchLatestMetricValue 反過來 import HTTP。這裡不查 registry（registry 在 application）、
// 不丟錯（錯誤訊息是 application/http 的事），只回答「這個 timeframe 對這支指標合不合法、
// 合法的話對應到哪一組 basis 欄位」。
//
// timeframe 格式（見 metricBasis.ts）：
//   - 季報型指標（periodType 這組）：Q/YTD/TTM/FY 其中之一，例如 "roe.TTM"。
//   - Beta 這類滾動統計量（lookbackRange+samplingInterval 這組）："<lookbackRange>_<samplingInterval>"，
//     例如 "beta.2Y_1W"——合法組合只看 allowedRollingWindowTimeframes，不是兩個陣列的自由交叉。
//   - 純市場快照（snapshotCadence 這組）：EOD，例如 "exchangePeRatio.EOD"。

export interface FieldRef {
  field: string; // 原始請求字串（"metricCode.timeframe"），拿來當回應 values 的 key
  metricCode: string;
  periodType: PeriodType;
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  snapshotCadence: SnapshotCadence;
  // 逐日型指標（lookbackRange/snapshotCadence 這兩組）存在獨立的 metric_daily_cadence_values 表，
  // 跟季報型（periodType 這組）不共用 metric_values——查詢端直接讀這個 boolean 決定要打哪張表。
  isDailyCadence: boolean;
  // 2026-09-23：月頻指標（group='monthly'，目前只有 sus）又是第三張表 metric_monthly_values。
  // **不變式：isDailyCadence 與 isMonthly 至多一個為 true**（兩者皆 false = 季報型 metric_values）。
  // 沒有改成三值 discriminator 是因為 isDailyCadence 已有 8 個消費端（screener SQL、history、
  // completeness…），換型別的漣漪遠大於多一個布林；改動時請維持這個不變式。
  isMonthly: boolean;
}

// 這支 metricCode 實際可用的 timeframe 清單（給 GET /metrics 的 validTimeframes 跟錯誤訊息用）。
export const validTimeframes = (definition: MetricDefinitionSpec): string[] => {
  switch (definition.group) {
    case 'period':
      return definition.allowedPeriodTypes;
    case 'rollingWindow':
      return definition.allowedRollingWindowTimeframes;
    case 'snapshot':
      return definition.allowedSnapshotCadences;
    // 月頻只有一種形狀，用單一 token 'M'——讓 screener 的 "metricCode.timeframe" 語法（sus.M）與
    // GET /metrics 的 validTimeframes 選單都不用為它開特例。
    case 'monthly':
      return ['M'];
  }
};

// timeframe 合法就回 FieldRef，不合法回 null（呼叫端依 definition.group 組錯誤訊息）。
export const resolveTimeframe = (definition: MetricDefinitionSpec, timeframe: string, displayField: string): FieldRef | null => {
  const metricCode = definition.metricCode;
  switch (definition.group) {
    case 'period': {
      if (!definition.allowedPeriodTypes.includes(timeframe as PeriodType)) return null;
      return { field: displayField, metricCode, isDailyCadence: false, isMonthly: false, ...periodTypeGroup(timeframe as PeriodType) };
    }
    case 'rollingWindow': {
      if (!definition.allowedRollingWindowTimeframes.includes(timeframe)) return null;
      const [lookbackRange, samplingInterval] = timeframe.split('_') as [LookbackRange, SamplingInterval];
      return { field: displayField, metricCode, isDailyCadence: true, isMonthly: false, ...rollingWindowGroup(lookbackRange, samplingInterval) };
    }
    case 'snapshot': {
      if (!definition.allowedSnapshotCadences.includes(timeframe as SnapshotCadence)) return null;
      return { field: displayField, metricCode, isDailyCadence: true, isMonthly: false, ...snapshotCadenceGroup(timeframe as SnapshotCadence) };
    }
    case 'monthly': {
      if (timeframe !== 'M') return null;
      // 四個 basis 欄位全部 'N/A'——月頻的座標是 (fiscalYear, fiscalMonth)，不屬於任何一組既有 basis。
      return { field: displayField, metricCode, isDailyCadence: false, isMonthly: true, periodType: 'N/A', lookbackRange: 'N/A', samplingInterval: 'N/A', snapshotCadence: 'N/A' };
    }
  }
};
