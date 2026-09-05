import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { MetricBasis } from './metricBasis';

export interface MetricDefinitionSpec {
  metricCode: string;
  formulaNote: string;
  allowedBases: MetricBasis[];
  dependsOn: string[]; // 暫時性：現有原始欄位名稱，不是 canonical account_code（尚不存在，見 spec v0.2 §6.1）
  currentFormulaVersion: number;
}

// 程式碼中的宣告式 registry（docs/analysis-ts-spec-v0.2.md §6.3）；DB 的 metric_definitions
// 一列從這裡 upsert 出去，避免兩邊各自維護一份定義而漂移。命名避開裸的 `registry`——
// src/adapters/swagger/registry.ts 已經有一個完全不同語意的 OpenAPIRegistry 實例叫這個名字。
export const metricDefinitionRegistry: Record<string, MetricDefinitionSpec> = {
  roe: {
    metricCode: 'roe',
    formulaNote:
      'Q(單季) = 本季淨利/本季期末權益*100，淨利/權益優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
      'Q_ANN = Q*4（簡易年化，非複利）；TTM = 近四季（含本季）淨利加總/本季期末權益*100，' +
      '四季不齊為 null（null_reason=insufficient_history）。這是獨立於 src/domainMetrics/roe.ts ' +
      '的重新實作（src/pitMetrics/roe/computeRoePit.ts），兩者理論上算出相同數字，差異即代表其中一份有 bug。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['netIncomeAttributableToParent', 'netIncome', 'equityAttributableToParent', 'totalEquity'],
    currentFormulaVersion: 1,
  },
};

// 冪等，backfill 腳本開跑前呼叫一次即可。
export const upsertMetricDefinition = async (spec: MetricDefinitionSpec): Promise<void> => {
  await analysisPrisma.metricDefinition.upsert({
    where: { metricCode: spec.metricCode },
    create: {
      metricCode: spec.metricCode,
      formulaNote: spec.formulaNote,
      allowedBases: spec.allowedBases,
      dependsOn: spec.dependsOn,
      currentFormulaVersion: spec.currentFormulaVersion,
    },
    update: {
      formulaNote: spec.formulaNote,
      allowedBases: spec.allowedBases,
      dependsOn: spec.dependsOn,
      currentFormulaVersion: spec.currentFormulaVersion,
    },
  });
};
