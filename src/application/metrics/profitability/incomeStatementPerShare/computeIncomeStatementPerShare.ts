import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { IncomeStatementFields } from '@/application/ports/financialStatements';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';
import { calculateAdministrativeExpensePerShare } from '@/domain/metrics/profitability/administrativeExpensePerShare/calculateAdministrativeExpensePerShare';
import { calculateCostOfGoodsSoldPerShare } from '@/domain/metrics/profitability/costOfGoodsSoldPerShare/calculateCostOfGoodsSoldPerShare';
import { calculateEquityMethodIncomePerShare } from '@/domain/metrics/profitability/equityMethodIncomePerShare/calculateEquityMethodIncomePerShare';
import { calculateExpectedCreditLossPerShare } from '@/domain/metrics/profitability/expectedCreditLossPerShare/calculateExpectedCreditLossPerShare';
import { calculateFinanceCostPerShare } from '@/domain/metrics/profitability/financeCostPerShare/calculateFinanceCostPerShare';
import { calculateGrossProfitPerShare } from '@/domain/metrics/profitability/grossProfitPerShare/calculateGrossProfitPerShare';
import { calculateIncomeTaxExpensePerShare } from '@/domain/metrics/profitability/incomeTaxExpensePerShare/calculateIncomeTaxExpensePerShare';
import { calculateInterestIncomePerShare } from '@/domain/metrics/profitability/interestIncomePerShare/calculateInterestIncomePerShare';
import { calculateMinorityInterestPerShare } from '@/domain/metrics/profitability/minorityInterestPerShare/calculateMinorityInterestPerShare';
import { calculateNonOperatingIncomePerShare } from '@/domain/metrics/profitability/nonOperatingIncomePerShare/calculateNonOperatingIncomePerShare';
import { calculateOperatingExpensePerShare } from '@/domain/metrics/profitability/operatingExpensePerShare/calculateOperatingExpensePerShare';
import { calculateOperatingIncomePerShare } from '@/domain/metrics/profitability/operatingIncomePerShare/calculateOperatingIncomePerShare';
import { calculateOtherGainsLossesPerShare } from '@/domain/metrics/profitability/otherGainsLossesPerShare/calculateOtherGainsLossesPerShare';
import { calculateOtherIncomePerShare } from '@/domain/metrics/profitability/otherIncomePerShare/calculateOtherIncomePerShare';
import { calculateOtherOperatingIncomeExpensePerShare } from '@/domain/metrics/profitability/otherOperatingIncomeExpensePerShare/calculateOtherOperatingIncomeExpensePerShare';
import { calculateResearchAndDevelopmentExpensePerShare } from '@/domain/metrics/profitability/researchAndDevelopmentExpensePerShare/calculateResearchAndDevelopmentExpensePerShare';
import { calculateSellingExpensePerShare } from '@/domain/metrics/profitability/sellingExpensePerShare/calculateSellingExpensePerShare';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——一次查詢損益表，
// 拆成多個獨立 metric_code，跟 computeCashFlowPerSharePit.ts/computeDupontFamilyPit.ts
// 同一種「一次查詢、拆多個 metric_code」模式。全部都是損益表原始金額科目直接除以股數，
// 不經過 margin 比率反推（grossMargin×revenuePerShare 這種算法會疊加 margin 欄位本身的
// 捨入誤差）。跟 eps 共用同一份 IncomeStatementPort 查詢，但刻意不合併進 computeEpsPit.ts
// ——eps 的淨利需要 pickNetIncome() 處理歸屬母公司/整體口徑的挑選邏輯，這裡的科目是損益表
// 單一欄位直接讀，沒有這層複雜度。
//
// ## 2026-09-24 改寫成表格驅動 + 補完整條瀑布
//
// 使用者要求「從現金股利倒推回營收，每一格都要有」。原本 7 個 slot 是三段幾乎一模一樣的
// 複製貼上（Q/TTM × 各自的完整度判斷與 knowledgeDate），再加 23 個 slot 會變成六百行同構
// 程式碼，任何一段改錯都很難看出來。改成一張 FIELDS 表 + 一個迴圈，**語意逐項保留**：
//
// - 既有 7 個 slot 的 slots key、metricCode、knowledgeDate 來源全部不變
//   （parity 已用實際資料逐格對照驗證）。
// - costOfGoodsSold/operatingExpense/incomeTaxExpense 三支**新增 Q**（原本 TTM-only）。
//   上游 quarterly_income_statement_xbrl 本來就是單季表，TTM-only 是當初的選擇不是資料限制。
// - 新增 10 個 metric_code 讓每一段都能加總還原（見 FIELDS 表的註解）。
//
// ## 為什麼沒有「完整度分組」
//
// 近四季要四季齊全才有值。2026-09-18 版本把幾支指標綁成一組共用這個判斷：毛利＋營業利益一組、
// 營業成本＋營業費用＋所得稅一組——**三項四季都有才算**。2026-09-24 改寫時為了 parity 原封保留。
//
// 2026-09-25 拿掉，因為那兩組綁的科目**不必然同時出現**：
//
//     所得稅有值、營業成本沒有      1,024 格 / 47 家   ← 金融業大宗
//     營業費用有值、營業成本沒有      712 格
//     營業利益有值、毛利沒有          232 格 / 11 家
//
// 銀行沒有營業成本這個科目，於是整組近四季失效，把明明有資料的所得稅、營業費用一起拖成 null。
// web-nuxt 要寫「每股所得稅」的說明時問「金融業為什麼沒有所得稅」——答案不是結構性沒有、也不是
// 欄位沒接，是被這個分組擋掉。單季不走分組，所以單季一直有值（2801 彰銀單季 20/23、近四季 0/23）。
//
// 現在每支指標只看自己的科目。已經有值的格子不會變（同樣四季的加總、同樣的知識日期），
// 只有先前被誤擋的 null 會變成有值。**不要再把指標綁成一組**——這支檔案裡的新欄位從一開始就是
// 「一支一組」，理由也適用在舊欄位：權益法投資損益只有 41% 揭露、研發費用 67%，綁在一起就是用
// 覆蓋率最低的那一支決定全組。

export type IncomeStatementPerShareDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

// 相減型欄位：兩個運算元都是千元 bigint 原始金額，相減後才除以股數，只捨入一次。
const nonOperatingIncomeOf = (r: IncomeStatementFields): bigint | null =>
  r.profitBeforeTax !== null && r.operatingIncome !== null ? r.profitBeforeTax - r.operatingIncome : null;
const minorityInterestOf = (r: IncomeStatementFields): bigint | null =>
  r.netIncome !== null && r.netIncomeAttributableToParent !== null ? r.netIncome - r.netIncomeAttributableToParent : null;

interface PerShareField {
  // slots 的 key，等於舊回傳值的欄位名，不能改（scripts 有讀）。FIELDS 用 `as const satisfies`
  // 而不是型別註記——註記會把 slot 退化成 string，ComputationBatch 的 key 就變成 index signature，
  // 下游 script 讀 outcome.grossProfitPerShareQ 會被 tsc 判成 possibly undefined。
  slot: string;
  metricCode: string;
  periodTypes: readonly ('Q' | 'TTM')[];
  pick: (row: IncomeStatementFields) => bigint | null;
  /**
   * 這支指標自己的 domain 計算函式。內容全部是 `toPerShare(amount, shares)`，看起來可以用一個
   * 共用 helper 取代——**不要那樣做**。專案慣例是一支指標一個 calculate 檔，每支檔案裡寫的是
   * 「這一格為什麼讀這個科目、為什麼不用別的欄位反推」，那才是它存在的價值；換成共用 helper 之後
   * 那些檔案會變成沒有人引用的死碼（2026-09-24 knip 實際抓到過一次）。
   */
  calc: (amount: bigint | null, shares: bigint | null) => CalcResult;
}

// pick 的結果一律過這一層：序列化過的資料（cassette 回放、JSON 往返）可能把「沒有這個欄位」
// 變成 undefined 而不是 null，而 `undefined !== null` 會通過完整度判斷、然後在 bigint 加總時
// 炸成 "Cannot mix BigInt and other types"。正規化成 null 讓兩者走同一條缺漏路徑。
const amountOf = (field: PerShareField, row: IncomeStatementFields | null): bigint | null =>
  (row ? field.pick(row) : null) ?? null;

const FIELDS = [
  // ---- 既有（2026-09-15）：毛利、營業利益 ----
  { slot: 'grossProfitPerShareQ', metricCode: 'grossProfitPerShare', periodTypes: ['Q'], pick: (r) => r.grossProfit, calc: calculateGrossProfitPerShare },
  { slot: 'grossProfitPerShareTtm', metricCode: 'grossProfitPerShare', periodTypes: ['TTM'], pick: (r) => r.grossProfit, calc: calculateGrossProfitPerShare },
  { slot: 'operatingIncomePerShareQ', metricCode: 'operatingIncomePerShare', periodTypes: ['Q'], pick: (r) => r.operatingIncome, calc: calculateOperatingIncomePerShare },
  { slot: 'operatingIncomePerShareTtm', metricCode: 'operatingIncomePerShare', periodTypes: ['TTM'], pick: (r) => r.operatingIncome, calc: calculateOperatingIncomePerShare },

  // ---- 既有（2026-09-18）：營業成本、營業費用、所得稅。2026-09-24 補上 Q ----
  { slot: 'costOfGoodsSoldPerShareTtm', metricCode: 'costOfGoodsSoldPerShare', periodTypes: ['TTM'], pick: (r) => r.operatingCost, calc: calculateCostOfGoodsSoldPerShare },
  { slot: 'costOfGoodsSoldPerShareQ', metricCode: 'costOfGoodsSoldPerShare', periodTypes: ['Q'], pick: (r) => r.operatingCost, calc: calculateCostOfGoodsSoldPerShare },
  { slot: 'operatingExpensePerShareTtm', metricCode: 'operatingExpensePerShare', periodTypes: ['TTM'], pick: (r) => r.operatingExpense, calc: calculateOperatingExpensePerShare },
  { slot: 'operatingExpensePerShareQ', metricCode: 'operatingExpensePerShare', periodTypes: ['Q'], pick: (r) => r.operatingExpense, calc: calculateOperatingExpensePerShare },
  { slot: 'incomeTaxExpensePerShareTtm', metricCode: 'incomeTaxExpensePerShare', periodTypes: ['TTM'], pick: (r) => r.incomeTaxExpense, calc: calculateIncomeTaxExpensePerShare },
  { slot: 'incomeTaxExpensePerShareQ', metricCode: 'incomeTaxExpensePerShare', periodTypes: ['Q'], pick: (r) => r.incomeTaxExpense, calc: calculateIncomeTaxExpensePerShare },

  // ---- 2026-09-24：營業費用四分拆。推銷 + 管理 + 研發 + IFRS9 預期信用減損 = 營業費用合計。
  // 原本以為只有三項，是瀑布圖恆等式測試在台達電（2308）身上抓到第四項的（差額剛好等於減損科目）。 ----
  { slot: 'sellingExpensePerShareQ', metricCode: 'sellingExpensePerShare', periodTypes: ['Q'], pick: (r) => r.sellingExpenses, calc: calculateSellingExpensePerShare },
  { slot: 'sellingExpensePerShareTtm', metricCode: 'sellingExpensePerShare', periodTypes: ['TTM'], pick: (r) => r.sellingExpenses, calc: calculateSellingExpensePerShare },
  { slot: 'administrativeExpensePerShareQ', metricCode: 'administrativeExpensePerShare', periodTypes: ['Q'], pick: (r) => r.adminExpenses, calc: calculateAdministrativeExpensePerShare },
  { slot: 'administrativeExpensePerShareTtm', metricCode: 'administrativeExpensePerShare', periodTypes: ['TTM'], pick: (r) => r.adminExpenses, calc: calculateAdministrativeExpensePerShare },
  { slot: 'researchAndDevelopmentExpensePerShareQ', metricCode: 'researchAndDevelopmentExpensePerShare', periodTypes: ['Q'], pick: (r) => r.researchAndDevelopmentExpense, calc: calculateResearchAndDevelopmentExpensePerShare },
  { slot: 'researchAndDevelopmentExpensePerShareTtm', metricCode: 'researchAndDevelopmentExpensePerShare', periodTypes: ['TTM'], pick: (r) => r.researchAndDevelopmentExpense, calc: calculateResearchAndDevelopmentExpensePerShare },

  { slot: 'expectedCreditLossPerShareQ', metricCode: 'expectedCreditLossPerShare', periodTypes: ['Q'], pick: (r) => r.expectedCreditLoss, calc: calculateExpectedCreditLossPerShare },
  { slot: 'expectedCreditLossPerShareTtm', metricCode: 'expectedCreditLossPerShare', periodTypes: ['TTM'], pick: (r) => r.expectedCreditLoss, calc: calculateExpectedCreditLossPerShare },
  { slot: 'otherOperatingIncomeExpensePerShareQ', metricCode: 'otherOperatingIncomeExpensePerShare', periodTypes: ['Q'], pick: (r) => r.netOtherIncomeExpenses, calc: calculateOtherOperatingIncomeExpensePerShare },
  { slot: 'otherOperatingIncomeExpensePerShareTtm', metricCode: 'otherOperatingIncomeExpensePerShare', periodTypes: ['TTM'], pick: (r) => r.netOtherIncomeExpenses, calc: calculateOtherOperatingIncomeExpensePerShare },

  // ---- 2026-09-24：業外損益合計 + 五個子項。子項相加（財務成本為減項）= 合計 ----
  { slot: 'nonOperatingIncomePerShareQ', metricCode: 'nonOperatingIncomePerShare', periodTypes: ['Q'], pick: nonOperatingIncomeOf, calc: calculateNonOperatingIncomePerShare },
  { slot: 'nonOperatingIncomePerShareTtm', metricCode: 'nonOperatingIncomePerShare', periodTypes: ['TTM'], pick: nonOperatingIncomeOf, calc: calculateNonOperatingIncomePerShare },
  { slot: 'interestIncomePerShareQ', metricCode: 'interestIncomePerShare', periodTypes: ['Q'], pick: (r) => r.interestIncome, calc: calculateInterestIncomePerShare },
  { slot: 'interestIncomePerShareTtm', metricCode: 'interestIncomePerShare', periodTypes: ['TTM'], pick: (r) => r.interestIncome, calc: calculateInterestIncomePerShare },
  { slot: 'otherIncomePerShareQ', metricCode: 'otherIncomePerShare', periodTypes: ['Q'], pick: (r) => r.otherIncome, calc: calculateOtherIncomePerShare },
  { slot: 'otherIncomePerShareTtm', metricCode: 'otherIncomePerShare', periodTypes: ['TTM'], pick: (r) => r.otherIncome, calc: calculateOtherIncomePerShare },
  { slot: 'otherGainsLossesPerShareQ', metricCode: 'otherGainsLossesPerShare', periodTypes: ['Q'], pick: (r) => r.otherGainsLosses, calc: calculateOtherGainsLossesPerShare },
  { slot: 'otherGainsLossesPerShareTtm', metricCode: 'otherGainsLossesPerShare', periodTypes: ['TTM'], pick: (r) => r.otherGainsLosses, calc: calculateOtherGainsLossesPerShare },
  { slot: 'equityMethodIncomePerShareQ', metricCode: 'equityMethodIncomePerShare', periodTypes: ['Q'], pick: (r) => r.equityMethodIncome, calc: calculateEquityMethodIncomePerShare },
  { slot: 'equityMethodIncomePerShareTtm', metricCode: 'equityMethodIncomePerShare', periodTypes: ['TTM'], pick: (r) => r.equityMethodIncome, calc: calculateEquityMethodIncomePerShare },
  { slot: 'financeCostPerShareQ', metricCode: 'financeCostPerShare', periodTypes: ['Q'], pick: (r) => r.financeCosts, calc: calculateFinanceCostPerShare },
  { slot: 'financeCostPerShareTtm', metricCode: 'financeCostPerShare', periodTypes: ['TTM'], pick: (r) => r.financeCosts, calc: calculateFinanceCostPerShare },

  // ---- 2026-09-24：少數股東損益。「稅前−所得稅」與 EPS 之間唯一的差額來源 ----
  { slot: 'minorityInterestPerShareQ', metricCode: 'minorityInterestPerShare', periodTypes: ['Q'], pick: minorityInterestOf, calc: calculateMinorityInterestPerShare },
  { slot: 'minorityInterestPerShareTtm', metricCode: 'minorityInterestPerShare', periodTypes: ['TTM'], pick: minorityInterestOf, calc: calculateMinorityInterestPerShare },
] as const satisfies readonly PerShareField[];

const SLOT_NAMES = FIELDS.map((f) => f.slot);

export type IncomeStatementPerShareComputationBatch = ComputationBatch<(typeof FIELDS)[number]['slot']>;

export const computeIncomeStatementPerShare = async (
  query: QuarterlyMetricQuery,
  deps: IncomeStatementPerShareDeps
): Promise<IncomeStatementPerShareComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);
  if (!resolvedQuarter) return noQuarterBatch(symbol, SLOT_NAMES) as IncomeStatementPerShareComputationBatch;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  // TTM：近四季（含本季）加總。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  // 每支指標各自判斷近四季齊不齊：四季都要有紀錄，而且**這支指標自己的科目**每一季都非 null。
  // 不跟其他指標共用判斷——見檔頭「為什麼沒有完整度分組」。
  const ttmComplete = new Map<string, boolean>();
  for (const field of FIELDS) {
    if (!ttmComplete.has(field.metricCode)) {
      ttmComplete.set(field.metricCode, ttmRecords.every((record) => record !== null && amountOf(field, record) !== null));
    }
  }

  // 四季的 knowledgeDate 錨點跟欄位無關（只看四季的 reportDate），整批算一次就好——
  // 舊版每個分組各呼叫一次 resolveKnowledgeDate，參數完全相同、結果必然相同。
  const anyTtmComplete = [...ttmComplete.values()].some(Boolean);
  const ttmAnchor = anyTtmComplete
    ? await resolveKnowledgeDate(symbol, ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements)
    : null;

  const slots = {} as Record<string, ComputationSlot>;
  for (const field of FIELDS) {
    const periodType = field.periodTypes[0]!;
    const coordinate = { symbol, metricCode: field.metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

    if (periodType === 'Q') {
      slots[field.slot] = mainAnchor
        ? computation({ ...coordinate, ...periodTypeGroup('Q'), ...field.calc(amountOf(field, incomeStatement), sharesValue), knowledgeDate: mainAnchor.knowledgeDate, knowledgeDateIsFallback: mainAnchor.isFallback })
        : { action: 'skipped_no_knowledge_date' };
      continue;
    }

    const complete = ttmComplete.get(field.metricCode) === true;
    if (complete) {
      // 四季齊全才加總；上面的完整度判斷已保證每一季都非 null。
      let sum = 0n;
      for (const record of ttmRecords) sum += amountOf(field, record)!;
      slots[field.slot] = ttmAnchor
        ? computation({ ...coordinate, ...periodTypeGroup('TTM'), ...field.calc(sum, sharesValue), knowledgeDate: ttmAnchor.knowledgeDate, knowledgeDateIsFallback: ttmAnchor.isFallback })
        : { action: 'skipped_no_knowledge_date' };
    } else if (mainAnchor) {
      slots[field.slot] = computation({ ...coordinate, ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate: mainAnchor.knowledgeDate, knowledgeDateIsFallback: mainAnchor.isFallback });
    } else {
      slots[field.slot] = { action: 'skipped_no_knowledge_date' };
    }
  }

  return { symbol, rocYear: year, season, slots } as IncomeStatementPerShareComputationBatch;
};
