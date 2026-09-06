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
  // 第二批遷移（ROA + Dupont 拆解家族）：roa 跟 roe 同形狀，dupont 家族的 4 個 metric_code
  // 是第一次遇到「一個概念天生由多個數字組成」的複合指標，拆成多個獨立 metric_code（各自
  // 單一數字），不是改 metric_values schema 塞多欄位——這是之後 ROIC/ROCE/多因子指標要
  // 複用的先例。5 個都是獨立於 src/domainMetrics/roa.ts|margins.ts|turnoverRatio.ts|dupont.ts
  // 的重新實作（src/pitMetrics/roa/computeRoaPit.ts、src/pitMetrics/dupont/computeDupontFamilyPit.ts），
  // 不呼叫任何 calculateXxx()、也不互相讀取彼此已寫入的 metric_value 列。
  roa: {
    metricCode: 'roa',
    formulaNote:
      'Q(單季) = 本季淨利/本季期末總資產*100，淨利優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
      'Q_ANN = Q*4（簡易年化）；TTM = 近四季（含本季）淨利加總/本季期末總資產*100，四季不齊為 null。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['netIncomeAttributableToParent', 'netIncome', 'totalAssets'],
    currentFormulaVersion: 1,
  },
  netProfitMargin: {
    metricCode: 'netProfitMargin',
    formulaNote:
      'Q(單季) = 本季淨利/本季營收*100，淨利優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
      'TTM = 近四季（含本季）淨利加總/近四季營收加總*100，四季不齊為 null。' +
      '沒有 Q_ANN——flow/flow 比率年化沒有意義（跟 src/domainMetrics/margins.ts 現有規則一致）。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['netIncomeAttributableToParent', 'netIncome', 'operatingRevenue'],
    currentFormulaVersion: 1,
  },
  assetTurnover: {
    metricCode: 'assetTurnover',
    formulaNote:
      'Q(單季) = 本季營收/本季期末總資產（次）；Q_ANN = Q*4（簡易年化）；' +
      'TTM = 近四季（含本季）營收加總/本季期末總資產，四季不齊為 null。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['operatingRevenue', 'totalAssets'],
    currentFormulaVersion: 1,
  },
  equityMultiplier: {
    metricCode: 'equityMultiplier',
    formulaNote:
      '= 本季期末總資產/本季期末權益，權益優先採歸屬於母公司口徑，缺漏退回整體口徑。純資產負債表' +
      '時點快照，只有 Q 一種 basis——跟 ROE 的權益一樣沒有 TTM/年化概念。',
    allowedBases: ['Q'],
    dependsOn: ['totalAssets', 'equityAttributableToParent', 'totalEquity'],
    currentFormulaVersion: 1,
  },
  dupontDecomposedRoe: {
    metricCode: 'dupontDecomposedRoe',
    formulaNote:
      'Q(單季) = netProfitMargin(Q) x assetTurnover(Q) x equityMultiplier；' +
      'TTM = netProfitMargin(TTM) x assetTurnover(TTM) x equityMultiplier（沿用同一個 Q 的權益乘數，' +
      '跟 src/domainMetrics/dupont.ts 的 decomposedRoeTtmPct 邏輯一致）。三個因子任一為 null，' +
      '不管原因為何，一律回報 null_reason=missing_input——各因子自己缺漏的細節記在各自的 metric_value 列上。' +
      '沒有 Q_ANN——舊架構本來就沒有這個變體。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['netIncomeAttributableToParent', 'netIncome', 'operatingRevenue', 'totalAssets', 'equityAttributableToParent', 'totalEquity'],
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
