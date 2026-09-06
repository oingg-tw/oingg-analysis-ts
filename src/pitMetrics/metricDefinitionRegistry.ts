import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { MetricBasis } from './metricBasis';

export interface MetricDefinitionSpec {
  metricCode: string;
  formulaNote: string;
  allowedBases: MetricBasis[];
  // 2026-09-06 起改存 mops-ts 驗證過的 XBRL account_code（export.xbrl_three_statements_long
  // 的 account_code 欄位，snake_case，是 mops-ts 自己整理過的命名，不是原始 IFRS PascalCase
  // 標籤）——之前用 mops-ts 原始欄位名稱（camelCase）是因為 XBRL 資料只涵蓋測試公司 1101，
  // 沒有真的公司可以驗證對應關係；mops-ts 現在已經補了 2330/2801 兩家真實公司的 XBRL 資料，
  // 這裡的對照關係都已經拿真實資料核對過，不是照標準科目名稱推論（見 UBIQUITOUS_LANGUAGE.md）。
  // 注意：這只是宣告內容改變（純字串），實際計算依然讀 quarterly_income_statement/
  // quarterly_balance_sheet（249 家公司覆蓋），不是切換去讀 XBRL 表——XBRL 目前只有 3 家
  // 公司有資料，拿來當計算來源會大幅縮減覆蓋率，不是這次的目的。
  dependsOn: string[];
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
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity'],
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
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'assets'],
    currentFormulaVersion: 1,
  },
  netProfitMargin: {
    metricCode: 'netProfitMargin',
    formulaNote:
      'Q(單季) = 本季淨利/本季營收*100，淨利優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
      'TTM = 近四季（含本季）淨利加總/近四季營收加總*100，四季不齊為 null。' +
      '沒有 Q_ANN——flow/flow 比率年化沒有意義（跟 src/domainMetrics/margins.ts 現有規則一致）。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'revenue'],
    currentFormulaVersion: 1,
  },
  assetTurnover: {
    metricCode: 'assetTurnover',
    formulaNote:
      'Q(單季) = 本季營收/本季期末總資產（次）；Q_ANN = Q*4（簡易年化）；' +
      'TTM = 近四季（含本季）營收加總/本季期末總資產，四季不齊為 null。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['revenue', 'assets'],
    currentFormulaVersion: 1,
  },
  equityMultiplier: {
    metricCode: 'equityMultiplier',
    formulaNote:
      '= 本季期末總資產/本季期末權益，權益優先採歸屬於母公司口徑，缺漏退回整體口徑。純資產負債表' +
      '時點快照，只有 Q 一種 basis——跟 ROE 的權益一樣沒有 TTM/年化概念。',
    allowedBases: ['Q'],
    dependsOn: ['assets', 'equity_attributable_to_owners_of_parent', 'equity'],
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
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'revenue', 'assets', 'equity_attributable_to_owners_of_parent', 'equity'],
    currentFormulaVersion: 1,
  },
  // 第三批遷移（profitability/cashFlow 簡單型 9 支舊架構檔案，共 10 個 metric_code）：
  // eps/bvps/revenuePerShare/dividendPayoutRatio/ocfPerShare/fcfPerShare/ocfToNetIncome/
  // accrualsRatio 都是獨立重新實作（跟 roa 同形狀），不呼叫任何 calculateXxx()。
  // ocfPerShare/fcfPerShare 由 src/pitMetrics/cashFlowPerShare/computeCashFlowPerSharePit.ts
  // 一次查詢寫兩個 metric_code（跟 Dupont 家族同一種處理）。sgr/fcfYield 是複合指標，
  // 分別獨立重新計算 ROE TTM+配息率 TTM、每股 FCF+股價，不依賴 roe/dividendPayoutRatio/
  // ocfPerShare/fcfPerShare 這些已寫入的 metric_value，維持每條 pipeline 獨立的原則。
  eps: {
    metricCode: 'eps',
    formulaNote:
      'Q(單季) = 本季淨利*1000/流通股數（股本歷史生效日<=本季報告日的最新一筆），淨利優先採歸屬' +
      '母公司口徑，缺漏退回整體口徑；Q_ANN = Q*4；TTM = 近四季（含本季）淨利加總*1000/流通股數，' +
      '四季不齊為 null。流通股數固定用「本季報告日」當下有效的股本，Q/TTM 共用同一個股數。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  bvps: {
    metricCode: 'bvps',
    formulaNote:
      '= 本季期末權益*1000/流通股數，權益優先採歸屬母公司口徑，缺漏退回整體口徑。純資產負債表' +
      '時點快照，只有 Q 一種 basis——跟 equityMultiplier 同一種形狀，沒有 TTM/年化概念。',
    allowedBases: ['Q'],
    dependsOn: ['equity_attributable_to_owners_of_parent', 'equity', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  revenuePerShare: {
    metricCode: 'revenuePerShare',
    formulaNote:
      'Q(單季) = 本季營收*1000/流通股數；Q_ANN = Q*4；TTM = 近四季（含本季）營收加總*1000/流通' +
      '股數，四季不齊為 null。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['revenue', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  dividendPayoutRatio: {
    metricCode: 'dividendPayoutRatio',
    formulaNote:
      'TTM = |近四季（含本季）股利發放加總| / 近四季淨利加總 * 100，淨利優先採歸屬母公司口徑，' +
      '淨利須為正才有意義（≤0 視為 zero_or_negative_denominator）。沒有 Q/Q_ANN——股利通常一年' +
      '發放 1-2 次，單季配息率會嚴重失真（跟 src/domainMetrics/dividendPayoutRatio.ts 現有規則一致）。',
    allowedBases: ['TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'dividendsPaid'],
    currentFormulaVersion: 1,
  },
  sgr: {
    metricCode: 'sgr',
    formulaNote:
      'TTM = ROE(TTM) x (1 - 配息率(TTM)/100)——獨立重新計算 ROE TTM 跟配息率 TTM 兩個子公式' +
      '（不依賴 roe/dividendPayoutRatio 這兩個 metric_code 已寫入的值），只有 TTM 一種 basis，' +
      '跟 src/domainMetrics/sgr.ts 只有 sgrTtm 一致。任一子計算因四季不齊而為 null 時回報' +
      'insufficient_history；子計算本身可算但值為 null（例如配息率分母≤0）時回報 missing_input。',
    allowedBases: ['TTM'],
    dependsOn: [
      'profit_loss_attributable_to_owners_of_parent',
      'profit_loss',
      'equity_attributable_to_owners_of_parent',
      'equity',
      'dividendsPaid',
    ],
    currentFormulaVersion: 1,
  },
  ocfPerShare: {
    metricCode: 'ocfPerShare',
    formulaNote:
      'Q(單季) = 本季營業活動現金流*1000/流通股數；Q_ANN = Q*4；TTM = 近四季（含本季）營業活動' +
      '現金流加總*1000/流通股數，四季不齊為 null。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['netCashFromOperatingActivities', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  fcfPerShare: {
    metricCode: 'fcfPerShare',
    formulaNote:
      'FCF = 營業活動現金流 + 資本支出（資本支出在來源資料是負值/流出，用加法，不是減法）；' +
      'Q(單季) = 本季 FCF*1000/流通股數；Q_ANN = Q*4；TTM = 近四季（含本季）FCF 加總*1000/流通' +
      '股數，四季不齊為 null。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  ocfToNetIncome: {
    metricCode: 'ocfToNetIncome',
    formulaNote:
      'Q(單季) = 本季營業活動現金流/本季淨利（倍，不是百分比）；TTM = 近四季（含本季）營業活動' +
      '現金流加總/近四季淨利加總。沒有 Q_ANN——flow/flow 比率年化沒有意義（跟 netProfitMargin 同' +
      '一種規則）。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'netCashFromOperatingActivities'],
    currentFormulaVersion: 1,
  },
  accrualsRatio: {
    metricCode: 'accrualsRatio',
    formulaNote:
      'Q(單季) = (本季淨利 − 本季營業活動現金流 − 本季投資活動現金流) / 本季期末總資產 * 100；' +
      'Q_ANN = Q*4；TTM 分子改用近四季（含本季）加總，分母仍固定用本季期末總資產（不平均、不' +
      '加總，跟 ROE/ROA 用期末值同一種簡化）。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: [
      'profit_loss_attributable_to_owners_of_parent',
      'profit_loss',
      'netCashFromOperatingActivities',
      'netCashFromInvestingActivities',
      'assets',
    ],
    currentFormulaVersion: 1,
  },
  fcfYield: {
    metricCode: 'fcfYield',
    formulaNote:
      'Q_ANN = 每股 FCF 單季年化 / 股價 * 100；TTM = 每股 FCF(TTM) / 股價 * 100。股價取這個座標' +
      '解析出來的 knowledge_date 當天（或之前最近一筆交易日）收盤價——跟財報公告日共用同一個' +
      'knowledge_date，不是另外設計一套「股價要取哪一天」的機制。獨立重新計算每股 FCF（不依賴' +
      'ocfPerShare/fcfPerShare 這兩個 metric_code 已寫入的值）。沒有單季非年化版本（跟舊架構' +
      '一致，是 P_FCF 估值倍數的倒數）。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures', 'paidInShares'],
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
