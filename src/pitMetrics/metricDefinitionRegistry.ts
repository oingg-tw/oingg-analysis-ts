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
//
// 2026-09-08 MarketRatios（src/domainMetrics/marketRatios.ts 的 per/pbr/dividendYield）
// 遷入 pitMetrics 方法論決策（尚未實作，這裡只記錄決定，不是待辦清單）：維持現行的
// TWSE/TPEx 官方每日公布數字 passthrough，不自己重算——這三個數字是交易所公開的權威
// 市場觀察值（跟 stockPrice 同類，是原始市場事實，不是從財報衍生出來的比率），跟已存在
// 的 pitMetrics `peRatio`/`pbRatio`（自己拿 XBRL 算 EPS/BVPS、只在季報知識時點更新一次）
// 是完全不同用途、刻意並存的兩組數字，不合併、不互相取代。dividendYield 沒有自算對應
// 版本可比較，直接沿用交易所數字最單純、也最貼近使用者查詢「殖利率」時的預期（跟大盤/
// 看盤軟體顯示的數字一致）。
// 規劃中的 metricCode 命名（避開跟既有 peRatio/pbRatio 撞名）：`exchangePeRatio`、
// `exchangePbRatio`、`dividendYield`（無撞名問題），三者都用 `DAILY` 這個 basis 值
// （見 metricBasis.ts 該值的說明）、`fiscalQuarter=DAILY_CADENCE_FISCAL_QUARTER`
// sentinel（見 metricValueWriter.ts）、knowledgeDate 用 resolveDailyCadenceKnowledgeDate
// 算（見 knowledgeDate.ts）——這三支基礎設施都已經在這批 Beta/MarketRatios 遷移前提
// 工作中準備好，真的要動手寫 computeExchangePeRatioPit.ts 等檔案時可以直接用。全市場
// 逐日回填的批次/排程基礎設施是另一個獨立、尚未開始的前提條件，不在這次決策範圍內。
export const metricDefinitionRegistry: Record<string, MetricDefinitionSpec> = {
  roe: {
    metricCode: 'roe',
    formulaNote:
      'Q(單季) = 本季淨利/本季期末權益*100，淨利/權益優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
      'Q_ANN = Q*4（簡易年化，非複利）；TTM = 近四季（含本季）淨利加總/本季期末權益*100，' +
      '四季不齊為 null（null_reason=insufficient_history）。這是獨立於 src/domainMetrics/roe.ts ' +
      '的重新實作（src/pitMetrics/profitability/roe/computeRoePit.ts），兩者理論上算出相同數字，差異即代表其中一份有 bug。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity'],
    currentFormulaVersion: 1,
  },
  // 第二批遷移（ROA + Dupont 拆解家族）：roa 跟 roe 同形狀，dupont 家族的 4 個 metric_code
  // 是第一次遇到「一個概念天生由多個數字組成」的複合指標，拆成多個獨立 metric_code（各自
  // 單一數字），不是改 metric_values schema 塞多欄位——這是之後 ROIC/ROCE/多因子指標要
  // 複用的先例。5 個都是獨立於 src/domainMetrics/roa.ts|margins.ts|turnoverRatio.ts|dupont.ts
  // 的重新實作（src/pitMetrics/profitability/roa/computeRoaPit.ts、src/pitMetrics/shared/dupont/computeDupontFamilyPit.ts），
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
  // 2026-09-07 新增：五因子 Extended DuPont，把上面 dupontDecomposedRoe 用的
  // netProfitMargin 再拆成稅務負擔×利息負擔×EBIT利潤率三層。EBIT = 稅前淨利+財務費用，
  // 跟 roic/roce/interestCoverage/netDebtToEbitda/evEbitda 已經在用的定義一致——**注意
  // 這個 EBIT 不等於既有 operatingMargin 用的 operatingIncome**（後者嚴格排除所有非
  // 營業損益，前者只加回財務費用，非營業損益還留在裡面），兩個「利潤率」數字不一樣，
  // 這批全部加 dupont 前綴避免混淆。已用 2330 115Q2 真實資料驗證過 dupontExtendedRoe
  // 精確等於既有的 dupontDecomposedRoe。
  dupontTaxBurden: {
    metricCode: 'dupontTaxBurden',
    formulaNote: 'Q(單季) = 本季淨利/本季稅前淨利*100；TTM = 近四季淨利加總/近四季稅前淨利加總*100。淨利優先採歸屬母公司口徑，缺漏退回整體口徑。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'profit_loss_before_tax'],
    currentFormulaVersion: 1,
  },
  dupontInterestBurden: {
    metricCode: 'dupontInterestBurden',
    formulaNote: 'Q(單季) = 本季稅前淨利/本季EBIT*100（EBIT=稅前淨利+財務費用）；TTM = 近四季稅前淨利加總/近四季EBIT加總*100。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['profit_loss_before_tax', 'finance_costs'],
    currentFormulaVersion: 1,
  },
  dupontEbitMargin: {
    metricCode: 'dupontEbitMargin',
    formulaNote: 'Q(單季) = 本季EBIT/本季營收*100（EBIT=稅前淨利+財務費用）；TTM = 近四季EBIT加總/近四季營收加總*100。跟既有 operatingMargin（=operatingIncome/營收）是不同的數字，operatingIncome 嚴格排除非營業損益，這裡的 EBIT 只加回財務費用。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['profit_loss_before_tax', 'finance_costs', 'revenue'],
    currentFormulaVersion: 1,
  },
  dupontExtendedRoe: {
    metricCode: 'dupontExtendedRoe',
    formulaNote:
      '五因子相乘 = dupontTaxBurden x dupontInterestBurden x dupontEbitMargin x assetTurnover x equityMultiplier（三個百分比因子跟兩個原始比率因子相乘後除以 10000 校正尺度）。' +
      '五個因子任一為 null，一律回報 null_reason=missing_input，細節記在各自的 metric_value 列上。理論上等於 dupontDecomposedRoe（已用真實資料驗證過一致）。沒有 Q_ANN。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'profit_loss_before_tax', 'finance_costs', 'revenue', 'assets', 'equity_attributable_to_owners_of_parent', 'equity'],
    currentFormulaVersion: 1,
  },
  // 第三批遷移（profitability/cashFlow 簡單型 9 支舊架構檔案，共 10 個 metric_code）：
  // eps/bvps/revenuePerShare/dividendPayoutRatio/ocfPerShare/fcfPerShare/ocfToNetIncome/
  // accrualsRatio 都是獨立重新實作（跟 roa 同形狀），不呼叫任何 calculateXxx()。
  // ocfPerShare/fcfPerShare 由 src/pitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit.ts
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
  // 2026-09-07 新增：本益比/本淨比。獨立重新算 EPS(TTM)/BVPS(Q)，不呼叫 eps/bvps 已寫入的
  // metric_value，維持每條 pipeline 獨立的原則——但公式跟這兩支完全相同，保證口徑一致，
  // 前端同時顯示這三個 metric_code 不會有數字兜不起來的問題。股價用 getStockPriceAsOf
  // (knowledge_date) 查，跟 fcfYield/psr/pFcf/evEbitda 同一個模式。
  peRatio: {
    metricCode: 'peRatio',
    formulaNote:
      '= 股價(knowledge_date當天或之前最近一筆收盤價) / EPS(TTM，近四季淨利加總*1000/流通股數)。' +
      '只有 TTM 一種 basis——台股慣例的本益比就是用近四季 EPS。EPS_TTM 剛好等於 0 才是 null' +
      '（zero_or_negative_denominator），為負仍計算出真實但為負的本益比，不隱藏。',
    allowedBases: ['TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  pbRatio: {
    metricCode: 'pbRatio',
    formulaNote:
      '= 股價(knowledge_date當天或之前最近一筆收盤價) / BVPS(本季期末權益*1000/流通股數)。只有 Q' +
      ' 一種 basis——跟 bvps 自己一樣是資產負債表時點快照，沒有 TTM/年化概念。BVPS 剛好等於 0' +
      ' 才是 null（zero_or_negative_denominator），為負（資不抵債）仍計算出真實但為負的本淨比。',
    allowedBases: ['Q'],
    dependsOn: ['equity_attributable_to_owners_of_parent', 'equity', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  // 2026-09-07 web-nuxt 要求：peRatio/pbRatio 河流圖需要「該期實際用來算比率的股價」
  // 本身，不要用 peRatio×eps 反推（見 computeStockPricePit.ts 檔頭說明）。只有 Q 一種
  // basis——股價本身沒有 TTM/年化概念，knowledge_date 解析只用資產負債表（跟 bvps 一致，
  // 保證跟 pbRatio 完全同步；跟 peRatio 絕大多數情況一致但沒有數學保證）。
  stockPrice: {
    metricCode: 'stockPrice',
    formulaNote: '= knowledge_date 當天或之前最近一筆收盤價（新台幣元）。查無股價資料時為 null（missing_input）。knowledge_date 解析只用資產負債表，不查損益表。',
    allowedBases: ['Q'],
    dependsOn: [],
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
  // 第四批遷移（resilience/turnover/valuation 簡單型 11 支舊架構檔案，共 13 個
  // metric_code）：debtRatio/currentRatio/quickRatio/cashRatio/deRatio/interestCoverage/
  // netDebtToEbitda/capexToRevenue/roic/roce 都是獨立重新實作，不呼叫任何 calculateXxx()。
  // currentRatio/quickRatio/cashRatio 由 src/pitMetrics/resilience/liquidityRatio/computeLiquidityRatioPit.ts
  // 一次查詢寫三個 metric_code（跟 Dupont 家族同一種處理）。psr/pFcf/evEbitda 第一次用到
  // 市值（getMarketCapAsOf）——複用 resolveKnowledgeDate 算出的 knowledgeDate 去查，跟
  // 第三批 fcfYield 發現的「股價/市值不需要另外設計 knowledge_date 機制」一致；三者都是
  // 獨立重新計算子公式鏈（不依賴 revenuePerShare/cashFlowPerShare/netDebtToEbitda 這些
  // 已寫入的 metric_value）。
  debtRatio: {
    metricCode: 'debtRatio',
    formulaNote: '= 本季期末總負債/本季期末總資產*100。純資產負債表時點快照，只有 Q 一種 basis。',
    allowedBases: ['Q'],
    dependsOn: ['liabilities', 'assets'],
    currentFormulaVersion: 1,
  },
  currentRatio: {
    metricCode: 'currentRatio',
    formulaNote: '= 本季期末流動資產/本季期末流動負債*100。純資產負債表時點快照，只有 Q 一種 basis。',
    allowedBases: ['Q'],
    dependsOn: ['current_assets', 'current_liabilities'],
    currentFormulaVersion: 1,
  },
  quickRatio: {
    metricCode: 'quickRatio',
    formulaNote: '= (本季期末流動資產-存貨)/本季期末流動負債*100。純資產負債表時點快照，只有 Q 一種 basis。',
    allowedBases: ['Q'],
    dependsOn: ['current_assets', 'current_liabilities', 'inventories'],
    currentFormulaVersion: 1,
  },
  cashRatio: {
    metricCode: 'cashRatio',
    formulaNote: '= 本季期末現金及約當現金/本季期末流動負債*100。純資產負債表時點快照，只有 Q 一種 basis。',
    allowedBases: ['Q'],
    dependsOn: ['cash_and_cash_equivalents', 'current_liabilities'],
    currentFormulaVersion: 1,
  },
  deRatio: {
    metricCode: 'deRatio',
    formulaNote:
      '= 有息負債(短期借款+應付公司債+長期借款)/本季期末權益*100，權益優先採歸屬母公司口徑，' +
      '缺漏退回整體口徑。純資產負債表時點快照，只有 Q 一種 basis。',
    allowedBases: ['Q'],
    dependsOn: ['shortTermBorrowings', 'bondsPayable', 'longterm_borrowings', 'equity_attributable_to_owners_of_parent', 'equity'],
    currentFormulaVersion: 1,
  },
  interestCoverage: {
    metricCode: 'interestCoverage',
    formulaNote:
      'EBIT = 稅前淨利+利息費用；Q(單季) = EBIT/利息費用（倍）；TTM = 近四季（含本季）EBIT 加總/' +
      '近四季利息費用加總。沒有 Q_ANN——flow/flow 比率年化沒有意義。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['profit_loss_before_tax', 'finance_costs'],
    currentFormulaVersion: 1,
  },
  netDebtToEbitda: {
    metricCode: 'netDebtToEbitda',
    formulaNote:
      '淨負債 = 有息負債(短期借款+應付公司債+長期借款) - 現金及約當現金；EBITDA = 稅前淨利+利息費用' +
      '+折舊+攤銷；Q_ANN = 淨負債/(本季 EBITDA*4)；TTM = 淨負債/近四季（含本季）EBITDA 加總。' +
      '只有 Q_ANN/TTM 兩種 basis——跟舊架構一致，taxonomy 只支援這兩種（store/flow 比率），沒有' +
      '單季非年化版本。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: [
      'shortTermBorrowings',
      'bondsPayable',
      'longterm_borrowings',
      'cash_and_cash_equivalents',
      'profit_loss_before_tax',
      'finance_costs',
      'depreciation',
      'amortization',
    ],
    currentFormulaVersion: 1,
  },
  capexToRevenue: {
    metricCode: 'capexToRevenue',
    formulaNote:
      'Q(單季) = |資本支出|/本季營收*100；TTM = |近四季（含本季）資本支出加總|/近四季營收加總*100。' +
      '沒有 Q_ANN——flow/flow 比率年化沒有意義。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['revenue', 'capitalExpenditures'],
    currentFormulaVersion: 1,
  },
  psr: {
    metricCode: 'psr',
    formulaNote:
      'Q_ANN = 市值/(本季營收*4*1000)；TTM = 市值/(近四季營收加總*1000)。市值取這個座標解析出來的' +
      'knowledge_date 當天（或之前最近一筆交易日）市值——跟財報公告日共用同一個 knowledge_date。' +
      '獨立重新計算營收（不依賴 revenuePerShare 這個 metric_code 已寫入的值）。沒有單季非年化版本' +
      '（store/flow 比率）。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: ['revenue'],
    currentFormulaVersion: 1,
  },
  pFcf: {
    metricCode: 'pFcf',
    formulaNote:
      '自由現金流 = 營業活動現金流+資本支出（資本支出來源資料是負值/流出，用加法）；Q_ANN = 市值/' +
      '(本季自由現金流*4*1000)；TTM = 市值/(近四季自由現金流加總*1000)。股價/市值查詢邏輯同 psr。' +
      '獨立重新計算自由現金流（不依賴 ocfPerShare/fcfPerShare 這兩個 metric_code 已寫入的值）。' +
      '沒有單季非年化版本。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures'],
    currentFormulaVersion: 1,
  },
  evEbitda: {
    metricCode: 'evEbitda',
    formulaNote:
      '企業價值 = 市值+淨負債*1000；Q_ANN = 企業價值/(本季 EBITDA*4*1000)；TTM = 企業價值/' +
      '(近四季 EBITDA 加總*1000)。股價/市值查詢邏輯同 psr。獨立重新計算淨負債+EBITDA（不依賴' +
      'netDebtToEbitda 這個 metric_code 已寫入的值，公式在兩個檔案各自重複一次，延續舊架構本身' +
      '在 interestCoverage/netDebtToEbitda/roic/roce 四個檔案各自重複定義 EBIT 的既有慣例）。' +
      '沒有單季非年化版本。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: [
      'shortTermBorrowings',
      'bondsPayable',
      'longterm_borrowings',
      'cash_and_cash_equivalents',
      'profit_loss_before_tax',
      'finance_costs',
      'depreciation',
      'amortization',
    ],
    currentFormulaVersion: 1,
  },
  roic: {
    metricCode: 'roic',
    formulaNote:
      'EBIT = 稅前淨利+利息費用；有效稅率 = 所得稅費用/稅前淨利（稅前淨利須為正，否則 NOPAT 為 ' +
      'null）；NOPAT = EBIT*(1-有效稅率)；投入資本 = 有息負債(短期借款+應付公司債+長期借款)+權益-' +
      '現金及約當現金，權益優先採歸屬母公司口徑；Q(單季) = NOPAT/投入資本*100；Q_ANN = Q*4；' +
      'TTM = 近四季（含本季）NOPAT 加總/本季期末投入資本*100（分母固定用本季，不平均不加總，跟' +
      'ROE/ROA 用期末值同一種簡化）。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: [
      'profit_loss_before_tax',
      'finance_costs',
      'income_tax_expense_continuing_operations',
      'shortTermBorrowings',
      'bondsPayable',
      'longterm_borrowings',
      'equity_attributable_to_owners_of_parent',
      'equity',
      'cash_and_cash_equivalents',
    ],
    currentFormulaVersion: 1,
  },
  roce: {
    metricCode: 'roce',
    formulaNote:
      'EBIT = 稅前淨利+利息費用；使用資本(Capital Employed) = 本季期末總資產-本季期末流動負債；' +
      'Q(單季) = EBIT/使用資本*100；Q_ANN = Q*4；TTM = 近四季（含本季）EBIT 加總/本季期末使用' +
      '資本*100（分母固定用本季，同 roic）。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['assets', 'current_liabilities', 'profit_loss_before_tax', 'finance_costs'],
    currentFormulaVersion: 1,
  },
  // 第五批遷移（第二層：margins/turnoverRatio 補完整，共 10 個 metric_code）：不動
  // netProfitMargin/assetTurnover（已由 computeDupontFamilyPit.ts 寫入），這裡只補這兩支
  // 舊架構檔案裡還沒做的其餘欄位。grossMargin/operatingMargin 由
  // src/pitMetrics/profitability/margins/computeMarginsFamilyPit.ts 一次查詢寫入；
  // inventoryTurnover/receivablesTurnover/fixedAssetTurnover/payablesTurnover/
  // inventoryDays/receivablesDays/payablesDays/cashConversionCycle 由
  // src/pitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit.ts 一次查詢寫入（跟
  // Dupont 家族同一種「一次查詢拆多個 metric_code」模式）。
  grossMargin: {
    metricCode: 'grossMargin',
    formulaNote:
      'Q(單季) = 本季毛利/本季營收*100；TTM = 近四季（含本季）毛利加總/近四季營收加總*100。' +
      '沒有 Q_ANN——flow/flow 比率年化沒有意義。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['gross_profit', 'revenue'],
    currentFormulaVersion: 1,
  },
  operatingMargin: {
    metricCode: 'operatingMargin',
    formulaNote:
      'Q(單季) = 本季營業利益/本季營收*100；TTM = 近四季（含本季）營業利益加總/近四季營收加總*100。' +
      '沒有 Q_ANN。',
    allowedBases: ['Q', 'TTM'],
    dependsOn: ['operatingIncome', 'revenue'],
    currentFormulaVersion: 1,
  },
  inventoryTurnover: {
    metricCode: 'inventoryTurnover',
    formulaNote:
      'Q(單季) = 本季營業成本/本季期末存貨（次）；Q_ANN = Q*4；TTM = 近四季（含本季）營業成本' +
      '加總/本季期末存貨。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['operating_costs', 'inventories'],
    currentFormulaVersion: 1,
  },
  receivablesTurnover: {
    metricCode: 'receivablesTurnover',
    formulaNote:
      'Q(單季) = 本季營收/本季期末應收帳款（次）；Q_ANN = Q*4；TTM = 近四季（含本季）營收加總/' +
      '本季期末應收帳款。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['revenue', 'accountsReceivable'],
    currentFormulaVersion: 1,
  },
  fixedAssetTurnover: {
    metricCode: 'fixedAssetTurnover',
    formulaNote:
      'Q(單季) = 本季營收/本季期末不動產、廠房及設備（次）；Q_ANN = Q*4；TTM = 近四季（含本季）' +
      '營收加總/本季期末不動產、廠房及設備。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['revenue', 'property_plant_and_equipment'],
    currentFormulaVersion: 1,
  },
  payablesTurnover: {
    metricCode: 'payablesTurnover',
    formulaNote:
      'Q(單季) = 本季營業成本/本季期末應付帳款（次）；Q_ANN = Q*4；TTM = 近四季（含本季）營業成本' +
      '加總/本季期末應付帳款。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: ['operating_costs', 'accountsPayable'],
    currentFormulaVersion: 1,
  },
  inventoryDays: {
    metricCode: 'inventoryDays',
    formulaNote:
      'DIO = 365/存貨周轉率（年化或 TTM）。只有 Q_ANN/TTM 兩種 basis——365/單季周轉率算出來是' +
      '「一季裡的天數」，不是有意義的週轉天數，週轉天數的定義本來就以一年為基準。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: ['operating_costs', 'inventories'],
    currentFormulaVersion: 1,
  },
  receivablesDays: {
    metricCode: 'receivablesDays',
    formulaNote: 'DSO = 365/應收帳款周轉率（年化或 TTM）。只有 Q_ANN/TTM 兩種 basis，理由同 inventoryDays。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: ['revenue', 'accountsReceivable'],
    currentFormulaVersion: 1,
  },
  payablesDays: {
    metricCode: 'payablesDays',
    formulaNote: 'DPO = 365/應付帳款周轉率（年化或 TTM）。只有 Q_ANN/TTM 兩種 basis，理由同 inventoryDays。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: ['operating_costs', 'accountsPayable'],
    currentFormulaVersion: 1,
  },
  cashConversionCycle: {
    metricCode: 'cashConversionCycle',
    formulaNote:
      'CCC = DIO + DSO − DPO。只有 Q_ANN/TTM 兩種 basis（跟三個組成天數一致）。三個組成任一為' +
      'null，不管原因為何，一律回報 missing_input——除非是因為 TTM 四季不齊，這種情況回報' +
      'insufficient_history（跟 Dupont 家族的複合值傳染判斷一致）。',
    allowedBases: ['Q_ANN', 'TTM'],
    dependsOn: ['operating_costs', 'inventories', 'revenue', 'accountsReceivable', 'accountsPayable'],
    currentFormulaVersion: 1,
  },
  // 第六批遷移（第三層：guru 分類 9 支重型多因子模型）：範圍刻意限縮成只遷移「最終分數/
  // 輸出」，不拆分內部子變量成獨立 metric_code（Piotroski 的 9 訊號、Beneish 的 8 變量、
  // Ohlson 的 9 變量、Altman 的 X1-X5、Nissim-Penman 的 FLEV/NBC/SPREAD 都是模型內部
  // 機制，不是一般會單獨查詢比較的財務比率）。grahamNumber/altmanZScore/
  // nissimPenmanRnoa 獨立重新實作，不依賴 eps/bvps/interestCoverage/assetTurnover/roe
  // 這些已遷移 metric_code。piotroskiFScore/beneishMScore/ohlsonOScore 第一次用到 YoY
  // 比較——沒有專門的「去年同季」查詢函式，重用既有 getPastNQuarters({rocYear,season},5)[0]
  // 拿去年同季的 year/season，不是新機制。
  grahamNumber: {
    metricCode: 'grahamNumber',
    formulaNote:
      '= sqrt(22.5 x EPS(TTM) x BVPS)，EPS(TTM)/BVPS 須為正才有意義。獨立重新計算 EPS(TTM)/' +
      'BVPS（不依賴 eps/bvps 這兩個 metric_code 已寫入的值）。只有 TTM 一種 basis——因為' +
      'EPS(TTM) 是否齊全決定整個公式算不算得出來。',
    allowedBases: ['TTM'],
    dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  ncav: {
    metricCode: 'ncav',
    formulaNote:
      '= (本季期末流動資產 − 總負債 − 特別股股本)/流通股數。純資產負債表時點快照，只有 Q 一種' +
      'basis。marginOfSafetyPrice（= ncav x 2/3）不獨立遷移，是純線性換算，呼叫端自己乘 2/3 即可。',
    allowedBases: ['Q'],
    dependsOn: ['current_assets', 'liabilities', 'paidInShares'],
    currentFormulaVersion: 1,
  },
  ownerEarnings: {
    metricCode: 'ownerEarnings',
    formulaNote:
      '每股股東盈餘 = (本季淨利+折舊+攤銷+資本支出)/流通股數（資本支出來源資料是負值/流出，' +
      '用加法）。Q(單季)/Q_ANN(=Q*4)/TTM（近四季各分項各自加總再除以流通股數），跟 eps/' +
      'revenuePerShare 同形狀。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: [
      'profit_loss_attributable_to_owners_of_parent',
      'profit_loss',
      'depreciation',
      'amortization',
      'capitalExpenditures',
      'paidInShares',
    ],
    currentFormulaVersion: 1,
  },
  altmanZScore: {
    metricCode: 'altmanZScore',
    formulaNote:
      'Z = 1.2*X1+1.4*X2+3.3*X3+0.6*X4+0.999*X5，X1=(流動資產-流動負債)/總資產、' +
      'X2=保留盈餘/總資產、X3=EBIT(TTM)/總資產、X4=市值/(總負債*1000)、X5=營收(TTM)/總資產。' +
      '獨立重新計算 EBIT(TTM)（公式抄自 interestCoverage，不依賴該 metric_code 已寫入的值）' +
      '跟 X5（公式抄自 assetTurnover，同樣不依賴）。市值查詢複用 resolveKnowledgeDate 的' +
      'knowledge_date，跟第四批 psr/pFcf/evEbitda 同一個套路。只有 TTM 一種 basis——X3/X5' +
      '都需要 TTM 資料才算得出來。原始版模型用上市製造業樣本校準，對非製造業（尤其金融/服務/' +
      '營建）適用性有限，這個警語只在舊架構的 warnings 呈現，PIT 版本不重複記錄使用限制文字' +
      '（metric_value 沒有 warnings 欄位）。',
    allowedBases: ['TTM'],
    dependsOn: [
      'current_assets',
      'current_liabilities',
      'assets',
      'retained_earnings',
      'profit_loss_before_tax',
      'finance_costs',
      'liabilities',
      'revenue',
    ],
    currentFormulaVersion: 1,
  },
  piotroskiFScore: {
    metricCode: 'piotroskiFScore',
    formulaNote:
      '9 個二元訊號（ROA 為正、CFO 為正、ROA 較去年同季提升、CFO>淨利、長期負債比率較去年同季' +
      '下降、流動比率較去年同季提升、流通股數未增加、毛利率較去年同季提升、總資產週轉率較去年' +
      '同季提升）通過數加總（0-9）。9 訊號需全部可判斷才有分數，任一無法判斷則整體為 null。' +
      '只有 Q 一種 basis——純粹本季 vs 去年同季的單點比較，沒有 TTM/年化概念。去年同季用' +
      'getPastNQuarters({rocYear,season},5)[0] 取得，不是專門的新機制。',
    allowedBases: ['Q'],
    dependsOn: [
      'profit_loss_attributable_to_owners_of_parent',
      'profit_loss',
      'assets',
      'netCashFromOperatingActivities',
      'longTermBorrowings',
      'current_assets',
      'current_liabilities',
      'gross_profit',
      'revenue',
      'paidInShares',
    ],
    currentFormulaVersion: 1,
  },
  beneishMScore: {
    metricCode: 'beneishMScore',
    formulaNote:
      '8 變量迴歸式：M=-4.84+0.92*DSRI+0.528*GMI+0.404*AQI+0.892*SGI+0.115*DEPI-0.172*SGAI' +
      '+4.037*TATA+0.0327*LVGI，除 TATA（單期指標）外，其餘 7 個變量都是本季 vs 去年同季的' +
      '比較。只有 Q 一種 basis，去年同季取法同 piotroskiFScore。',
    allowedBases: ['Q'],
    dependsOn: [
      'accountsReceivable',
      'revenue',
      'gross_profit',
      'current_assets',
      'property_plant_and_equipment',
      'assets',
      'depreciation',
      'sellingExpenses',
      'adminExpenses',
      'profit_loss_attributable_to_owners_of_parent',
      'profit_loss',
      'netCashFromOperatingActivities',
      'liabilities',
    ],
    currentFormulaVersion: 1,
  },
  nissimPenmanRnoa: {
    metricCode: 'nissimPenmanRnoa',
    formulaNote:
      'NOPAT = 營業利益*(1-有效稅率)；NOA(淨營業資產) = 權益+NFO(淨金融負債，= 有息負債-現金)；' +
      'Q(單季) = NOPAT/NOA*100；Q_ANN = Q*4；TTM = 近四季（含本季）NOPAT 加總/本季期末 NOA*100' +
      '（分母固定用本季，同 ROIC）。只遷移 RNOA 本身，不遷移 FLEV/NBC/SPREAD/reconstructedRoe' +
      '（沒有獨立查詢價值，範圍刻意限縮）。',
    allowedBases: ['Q', 'Q_ANN', 'TTM'],
    dependsOn: [
      'operatingIncome',
      'profit_loss_before_tax',
      'income_tax_expense_continuing_operations',
      'shortTermBorrowings',
      'bondsPayable',
      'longterm_borrowings',
      'cash_and_cash_equivalents',
      'equity_attributable_to_owners_of_parent',
      'equity',
    ],
    currentFormulaVersion: 1,
  },
  zmijewskiScore: {
    metricCode: 'zmijewskiScore',
    formulaNote:
      'X = -4.3-4.5*(淨利TTM/總資產)+5.7*(總負債/總資產)-0.004*(流動資產/流動負債)。淨利用' +
      'TTM（原始模型用年度財報校準，TTM 是最接近的替代口徑，跟 ROE/ROA 邏輯一致），其餘皆為' +
      '本季資產負債表快照。沒有 YoY，只有 TTM 一種 basis。',
    allowedBases: ['TTM'],
    dependsOn: [
      'profit_loss_attributable_to_owners_of_parent',
      'profit_loss',
      'assets',
      'liabilities',
      'current_assets',
      'current_liabilities',
    ],
    currentFormulaVersion: 1,
  },
  ohlsonOScore: {
    metricCode: 'ohlsonOScore',
    formulaNote:
      '9 變量 Logit 模型：SIZE=ln(總資產)、TLTA=總負債/總資產、WCTA=(流動資產-流動負債)/總資產、' +
      'CLCA=流動負債/流動資產、OENEG=總負債>總資產?1:0、NITA=淨利(TTM)/總資產、' +
      'FUTL=營運現金流(TTM)/總負債、INTWO=今年及去年TTM淨利皆為負?1:0、' +
      'CHIN=(今年TTM淨利-去年TTM淨利)/(|今年|+|去年|)。INTWO/CHIN 需要「今年 TTM vs 去年同季' +
      'TTM」比較——去年同季 TTM 窗口用 getPastNQuarters n=5 取錨點、再從錨點往前抓 4 季建窗口，' +
      '不是新機制。只有 TTM 一種 basis。',
    allowedBases: ['TTM'],
    dependsOn: [
      'assets',
      'liabilities',
      'current_assets',
      'current_liabilities',
      'profit_loss_attributable_to_owners_of_parent',
      'profit_loss',
      'netCashFromOperatingActivities',
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
  // 2026-09-06 新增——銀行業專屬指標，全新指標不是舊架構遷移（src/domainMetrics/ 從來沒有
  // 銀行業指標的既有檔案）。資料來自 mops-ts 銀行監理揭露 XBRL 表（不是 xbrl_three_
  // statements_long 三大表那套 account_code），dependsOn 直接用查詢層的 camelCase 欄位
  // 名稱。都只有 Q 一種 basis（資產負債表時點快照，沒有 TTM/年化概念）。
  bankNplRatio: {
    metricCode: 'bankNplRatio',
    formulaNote:
      '全行逾放比，直接讀 mops-ts 的 bank_asset_quality_xbrl（category=\'TotalLoans\'）已經算好的' +
      'non_performing_loans_ratio，不用自己推公式。覆蓋約 19-20 檔銀行/金控股，每季都有資料；' +
      '非銀行公司一律優雅降級成 missing_input，不做前置的「這家公司是不是銀行」判斷。',
    allowedBases: ['Q'],
    dependsOn: ['nonPerformingLoansRatio'],
    currentFormulaVersion: 1,
  },
  bankNplCoverageRatio: {
    metricCode: 'bankNplCoverageRatio',
    formulaNote:
      '備抵呆帳覆蓋率，跟 bankNplRatio 同一列（bank_asset_quality_xbrl 的 TotalLoans）、' +
      '同一次查詢、同一組 knowledge_date，直接讀已經算好的 coverage_ratio。',
    allowedBases: ['Q'],
    dependsOn: ['coverageRatio'],
    currentFormulaVersion: 1,
  },
  bankCarRatio: {
    metricCode: 'bankCarRatio',
    formulaNote:
      '資本適足率 = eligible_capital / risk_weighted_assets * 100——這批唯一自己做除法的' +
      '欄位（其餘都是直接讀 mops-ts 算好的比率）。資料源 bank_capital_adequacy_detail_xbrl' +
      '只覆蓋 6-7 檔銀行/金控股，且只有 Q2/Q4 有真實值（監理揭露頻率本來就是半年一次，' +
      'Q1/Q3 一律 missing_input，不是資料缺漏）。不給 year/season 時的「最新一季」判斷刻意' +
      '排除值為 null 的季度，見 getLatestQuarterWithBankCapitalAdequacy 的說明。',
    allowedBases: ['Q'],
    dependsOn: ['eligibleCapital', 'riskWeightedAssets'],
    currentFormulaVersion: 1,
  },
  bankCet1Ratio: {
    metricCode: 'bankCet1Ratio',
    formulaNote: '普通股權益比率（CET1），直接讀 bank_capital_adequacy_detail_xbrl 已經算好的 ratio_ordinary_share_equity_to_rwa，覆蓋率/頻率限制同 bankCarRatio。',
    allowedBases: ['Q'],
    dependsOn: ['ratioOrdinaryShareEquityToRwa'],
    currentFormulaVersion: 1,
  },
  bankTier1Ratio: {
    metricCode: 'bankTier1Ratio',
    formulaNote: '第一類資本比率（Tier1），直接讀已經算好的 ratio_tier_i_capital_to_rwa，跟 bankCarRatio/bankCet1Ratio 共用同一次查詢/同一組 knowledge_date，覆蓋率/頻率限制同 bankCarRatio。',
    allowedBases: ['Q'],
    dependsOn: ['ratioTierICapitalToRwa'],
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
