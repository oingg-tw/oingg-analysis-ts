import { getLatestAvailableQuarter } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { BankIncomeStatementFields, IncomeStatementFields } from '@/application/ports/financialStatements';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { calculateGrossMargin } from '@/domain/metrics/profitability/grossMargin/calculateGrossMargin';
import { calculateOperatingMargin } from '@/domain/metrics/profitability/operatingMargin/calculateOperatingMargin';
import { calculateNetProfitMargin } from '@/domain/metrics/profitability/netProfitMargin/calculateNetProfitMargin';
import { annualReportSlot, resolveAnnualReportContext } from '../../shared/annualReportSlot';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingIncomeStatements, type TrailingYear } from '@/application/metrics/shared/trailingYear';
import { withBankAnnualIncome, withBankIncome } from '@/application/metrics/shared/bankAwareIncome';
import { NET_PROFIT_MARGIN_FORMULA_VERSION } from '@/application/metrics/shared/dupont/computeDupontFamily';

// 這份檔案獨立重新實作 src/domainMetrics/margins.ts 裡「還沒遷移」的兩個率（毛利率/
// 營業利益率）——netProfitMargin 已經由 src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts
// 寫入，這裡不重複寫。一次查詢拆兩個 metric_code，跟 Dupont 家族同一種模式。
//
// 刻意的行為差異：舊架構 margins.ts 的 TTM 完整度判斷是「營收/毛利/營業利益/淨利」四個
// 欄位共用一個旗標（因為舊架構一次算三個率）。這裡只算毛利率/營業利益率兩個率，TTM
// 完整度判斷只看「營收/毛利/營業利益」三個欄位，不看淨利——不應該因為淨利缺漏就連累
// 毛利率算不出來，這是比舊架構更精確的判斷，不是疏漏。
//
// 2026-09-08 新增保險業（IFRS17）替代科目 fallback——保險業財報結構沒有「銷貨成本/
// 毛利」概念，一般產業科目在保險業 XBRL 資料裡完全不存在（不是資料缺漏）。查證+對照
// conductor-ts 研究筆記後定案的三層對照見 insuranceIncomeStatementXbrlFirst.ts 檔頭：
// revenue -> insurance_revenue、grossProfit -> insurance_service_result、
// operatingIncome -> net_operating_income_loss。金控業刻意不做同樣的事（margin/
// turnover 概念在金控業結構性不成立，需要全新指標概念，不是替代科目能解決的問題，
// 同樣見那份研究筆記的說明），不要看到這裡的模式就依樣畫葫蘆幫金控業加。
// 2026-10-08 使用者推翻銀行這一塊：純銀行改照券商軟體口徑算（營收＝利息收入總額＋非利息淨收益、毛利再扣利息費用與呆帳、
// 營業利益＝稅前淨利，見 domain/financials/bankIncome.ts，2838 毛利率／淨利率對得上）。金控、保險以外的金融業仍維持不適用，
// 等使用者給券商軟體數字驗證後再另做。
export interface MarginInputs {
  reportDate: Date;
  revenue: bigint | null;
  grossProfitLike: bigint | null;
  operatingIncomeLike: bigint | null;
  source: 'general' | 'insurance' | 'bank';
  // 銀行口徑時的原始科目（溯源表拆解用）：利息收入總額來自一般損益表，其餘來自銀行損益表明細。
  bankDetail: { interestIncome: bigint | null; bank: BankIncomeStatementFields } | null;
}

// 2026-09-13 稽核鏈擴大到 grossMargin/operatingMargin 需要重用這支「一般表 or 保險替代表」
// 的查詢邏輯（見下方保險業 fallback 說明），改成 export——純查詢函式，沒有副作用，跟
// getGreenblattRocInputs 抽出來給 provenance 重用是同一個模式。多回傳一個
// source（一般／保險／銀行），讓 provenance 知道這筆該標哪個 statementType/fieldKey。
type MarginKey = { symbol: string; year: number; quarter: number; dataType: string; subsidiaryCompanyId: string };

export const getMarginInputs = async (key: MarginKey, deps: Pick<MarginsFamilyDeps, 'statements'>): Promise<MarginInputs | null> =>
  marginInputsFrom(await deps.statements.getIncomeStatement(key), key, deps);

// 2026-10-01 近一年的 MarginInputs（compute 的 TTM 與 grossMargin／operatingMargin 溯源表共用，值與 entries 出自同一份資料）。
// 保險替代表只有單季，只在四季窗口退回；興櫃半年期間不退回。
export const resolveTrailingMarginInputs = async (
  key: { symbol: string; rocYear: number; season: Season; dataType: string; subsidiaryCompanyId: string },
  deps: Pick<MarginsFamilyDeps, 'statements' | 'cumulativeStatements'>
): Promise<TrailingYear<MarginInputs>> => {
  const trailing = await resolveTrailingIncomeStatements(key, deps);
  const periods = await Promise.all(
    trailing.periods.map(async (p) => ({
      year: p.year,
      season: p.season,
      record: await marginInputsFrom(p.record, trailing.basis === 'quarters' ? { symbol: key.symbol, year: Number(p.year), quarter: Number(p.season), dataType: key.dataType, subsidiaryCompanyId: key.subsidiaryCompanyId } : null, deps),
    }))
  );
  return { basis: trailing.basis, periods };
};

// 2026-10-01 拆出「一般損益表已經查好」的版本：TTM 的一般損益表改來自共用近一年來源（見 shared/trailingYear.ts）。
// insuranceKey 為 null 時不退回保險替代表——興櫃半年期間沒有對應的單季保險表可拿。
const marginInputsFrom = async (incomeStatement: IncomeStatementFields | null, insuranceKey: MarginKey | null, deps: Pick<MarginsFamilyDeps, 'statements'>): Promise<MarginInputs | null> => {
  if (incomeStatement?.operatingRevenue != null) {
    return { reportDate: incomeStatement.reportDate, revenue: incomeStatement.operatingRevenue, grossProfitLike: incomeStatement.grossProfit, operatingIncomeLike: incomeStatement.operatingIncome, source: 'general', bankDetail: null };
  }

  const insurance = insuranceKey ? await deps.statements.getInsuranceIncomeStatement(insuranceKey) : null;
  if (insurance) {
    return { reportDate: insurance.reportDate, revenue: insurance.insuranceRevenue, grossProfitLike: insurance.insuranceServiceResult, operatingIncomeLike: insurance.netOperatingIncomeLoss, source: 'insurance', bankDetail: null };
  }

  // 2026-10-08 純銀行（銀行損益表明細查得到）。跟保險一樣只有單季，興櫃半年期間（insuranceKey: null）不退回。
  const bankAware = insuranceKey ? await withBankIncome(incomeStatement, insuranceKey, deps) : null;
  if (bankAware?.revenueSource === 'bank') {
    return { reportDate: bankAware.reportDate, revenue: bankAware.operatingRevenue, grossProfitLike: bankAware.grossProfit, operatingIncomeLike: bankAware.operatingIncome, source: 'bank', bankDetail: { interestIncome: bankAware.interestIncome, bank: bankAware.bank! } };
  }

  // 一般查得到列但 operatingRevenue 是 null（例如保險業在一般表裡有 profit_loss 等
  // 欄位、只是沒有 revenue），且保險替代也查無資料——回傳一般查詢結果的 reportDate（如果
  // 有）讓 knowledgeDate 解析至少能跑，三個金額欄位維持 null 走既有的 missing_input 邏輯。
  if (incomeStatement) {
    return { reportDate: incomeStatement.reportDate, revenue: null, grossProfitLike: null, operatingIncomeLike: null, source: 'general', bankDetail: null };
  }
  return null;
};

// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——grossMargin/
// operatingMargin 兩個 metricCode 的實際計算公式已經拆進 calculations/ 底下各自的檔案，
// 這裡只負責把查回來的原始財報數字傳給對應的 calculateXxx() 純函式、串接輸出、決定
// knowledge_date、呼叫 writeMetricValue。


const withNetProfitMarginVersion = (slot: ComputationSlot): ComputationSlot => (isComputationSkip(slot) ? slot : { ...slot, formulaVersion: NET_PROFIT_MARGIN_FORMULA_VERSION });

export type MarginsFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'industry' | 'cumulativeStatements' | 'annualReports' | 'shares'>;

export type MarginsFamilyComputationBatch = ComputationBatch<'grossMarginQ' | 'grossMarginTtm' | 'grossMarginFy' | 'operatingMarginQ' | 'operatingMarginTtm' | 'operatingMarginFy' | 'netProfitMarginFy'>;

export const computeMarginsFamily = async (
  query: QuarterlyMetricQuery,
  deps: MarginsFamilyDeps
): Promise<MarginsFamilyComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: MarginsFamilyComputationBatch = noQuarterBatch(symbol, ['grossMarginQ', 'grossMarginTtm', 'grossMarginFy', 'operatingMarginQ', 'operatingMarginTtm', 'operatingMarginFy', 'netProfitMarginFy']);

  // 一般 incomeStatement 查無資料（例如 2851 中再保在舊架構 legacy 表完全沒有列）時，
  // 改用保險替代來源解析「最新一季」——兩個資料源獨立各自解析一次最新季度，取交集下界
  // 的邏輯跟 getLatestAvailableQuarter 內部一致，但這裡是「一般 OR 保險替代」不是
  // 「一般 AND 現金流量表」，所以不能直接塞進 getLatestAvailableQuarter 的 sources
  // 參數，用獨立的 fallback 呼叫。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : ((await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement'], deps.quarters)) ??
        (await deps.quarters.latestQuarterWith('insuranceIncomeStatement', symbol, dataType, subsidiaryCompanyId).then((q) => (q ? { year: String(q.year), season: String(q.quarter) as Season } : null))));

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const marginInputs = await getMarginInputs(key, deps);
  const operatingRevenue = marginInputs?.revenue ?? null;
  const grossProfit = marginInputs?.grossProfitLike ?? null;
  const operatingIncome = marginInputs?.operatingIncomeLike ?? null;
  const reportDate = marginInputs?.reportDate ?? null;

  const grossMarginQuarterly = calculateGrossMargin(grossProfit, operatingRevenue);
  const operatingMarginQuarterly = calculateOperatingMargin(operatingIncome, operatingRevenue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let grossMarginQ: ComputationSlot;
  let operatingMarginQ: ComputationSlot;

  if (!mainAnchor) {
    grossMarginQ = { action: 'skipped_no_knowledge_date' };
    operatingMarginQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossMarginQ = computation({ ...coordinateFor('grossMargin'), ...periodTypeGroup('Q'), value: grossMarginQuarterly.value, nullReason: grossMarginQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    operatingMarginQ = computation({
      ...coordinateFor('operatingMargin'),
      ...periodTypeGroup('Q'),
      value: operatingMarginQuarterly.value,
      nullReason: operatingMarginQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  }

  // TTM：近四季（含本季）營收/毛利/營業利益各自加總。一季只要這三個欄位任一為 null 就視為
  // 該季不齊——刻意不看淨利（見檔頭說明的行為差異）。每一季各自呼叫 getMarginInputs（一般
  // 查無資料時自動退回保險替代），不是整批只判斷一次資料源——理論上一家公司不會中途切換
  // 產業別，但這樣寫不用假設「本季用的來源，前三季一定也用同一個」。
  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）；保險替代表只有單季，只在四季窗口退回。
  const trailing = await resolveTrailingMarginInputs({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);

  let revenueTtmSum = 0n;
  let grossProfitTtmSum = 0n;
  let operatingIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.revenue === null || record.grossProfitLike === null || record.operatingIncomeLike === null) {
      ttmComplete = false;
    } else {
      revenueTtmSum += record.revenue;
      grossProfitTtmSum += record.grossProfitLike;
      operatingIncomeTtmSum += record.operatingIncomeLike;
    }
  }

  const grossMarginTtmCalc = ttmComplete ? calculateGrossMargin(grossProfitTtmSum, revenueTtmSum) : { value: null, nullReason: 'insufficient_history' as const };
  const operatingMarginTtmCalc = ttmComplete ? calculateOperatingMargin(operatingIncomeTtmSum, revenueTtmSum) : { value: null, nullReason: 'insufficient_history' as const };

  let grossMarginTtm: ComputationSlot;
  let operatingMarginTtm: ComputationSlot;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      grossMarginTtm = { action: 'skipped_no_knowledge_date' };
      operatingMarginTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      grossMarginTtm = computation({
        ...coordinateFor('grossMargin'),
        ...periodTypeGroup('TTM'),
        value: grossMarginTtmCalc.value,
        nullReason: grossMarginTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      operatingMarginTtm = computation({
        ...coordinateFor('operatingMargin'),
        ...periodTypeGroup('TTM'),
        value: operatingMarginTtmCalc.value,
        nullReason: operatingMarginTtmCalc.nullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossMarginTtm = computation({ ...coordinateFor('grossMargin'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    operatingMarginTtm = computation({ ...coordinateFor('operatingMargin'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    grossMarginTtm = { action: 'skipped_no_knowledge_date' };
    operatingMarginTtm = { action: 'skipped_no_knowledge_date' };
  }

  // 2026-10-04 年度版（FY）：使用者要求先做證交所有公布的利潤率，口徑對齊證交所營益分析（t187ap17_L）——tmp/marginVerify.ts 拿 115Q2
  // 累計損益表逐家對：毛利率、營業利益率 1,048/1,049 吻合；稅後純益率用「本期淨利（總額）」1,048/1,049，歸屬母公司只有 448/984，
  // 所以 FY 的稅後淨利率是總額口徑（跟 ROE 年度版同一個「對齊官方」原則；Q／TTM 維持歸屬母公司優先，不動）。
  // netProfitMargin 的 Q／TTM 在杜邦家族算，FY 跟另外兩支共用同一份年報放在這裡。年報與座標、公告日規則沿用 annualReportSlot。
  // ponytail: 保險業年報沒有毛利／營業利益科目，FY 是 null（Q／TTM 有保險替代科目），要補再把 marginInputsFrom 的保險替代接到年報。
  const annual = await resolveAnnualReportContext({ symbol, rocYear, season: seasonNum, dataType, subsidiaryCompanyId }, deps);
  // 2026-10-08 銀行年報同樣沒有營收／毛利／營業利益，用同年四個單季的銀行公式加總補上（見 shared/bankAwareIncome.ts）。
  const a = annual ? await withBankAnnualIncome(annual.annual, { symbol, rocYear: annual.fiscalYear - 1911, dataType, subsidiaryCompanyId }, deps) : null;
  const fyBase = (metricCode: string) => ({ symbol, metricCode, dataType, subsidiaryCompanyId });
  const grossMarginFy = annualReportSlot(annual, fyBase('grossMargin'), calculateGrossMargin(a?.grossProfit ?? null, a?.operatingRevenue ?? null));
  const operatingMarginFy = annualReportSlot(annual, fyBase('operatingMargin'), calculateOperatingMargin(a?.operatingIncome ?? null, a?.operatingRevenue ?? null));
  const netProfitMarginFy = annualReportSlot(annual, fyBase('netProfitMargin'), calculateNetProfitMargin(a ? (a.netIncome ?? a.netIncomeAttributableToParent) : null, a?.operatingRevenue ?? null));

  // 2026-09-28 金融業不適用改在這裡判斷，不走通用的 notApplicableToFinancialIndustry 標記：保險業有保險損益表替代科目，
  // 毛利率／營業利益率對它們適用。IFRS 17 保險收入 115Q1 才開始有資料，近四季要到 115Q4 才湊滿——那段期間 TTM 是
  // insufficient_history（真的歷史不足），不是不適用（bff-ts／web-nuxt 抓到：產險 5 家 Q 有值、TTM 卻被標不適用，
  // 「不適用是公司層級的事實，不該隨基準改變」）。只有沒有任何保險損益表的金融業（銀行、金控、證券）才標不適用。
  // 2026-10-08 純銀行也適用了（銀行口徑），同樣排除：早期季度近四季湊不齊是真的歷史不足，不是不適用。
  const notApplicable =
    (await deps.industry.isFinancialIndustryCompany(symbol)) &&
    !(await deps.quarters.latestQuarterWith('insuranceIncomeStatement', symbol, dataType, subsidiaryCompanyId)) &&
    !(await deps.quarters.latestQuarterWith('bankIncomeStatement', symbol, dataType, subsidiaryCompanyId));
  const relabel = (slot: ComputationSlot): ComputationSlot =>
    notApplicable && !isComputationSkip(slot) && slot.value === null ? { ...slot, nullReason: 'not_applicable_industry' } : slot;
  return {
    symbol,
    rocYear: year,
    season,
    slots: {
      grossMarginQ: relabel(grossMarginQ),
      grossMarginTtm: relabel(grossMarginTtm),
      grossMarginFy: relabel(grossMarginFy),
      operatingMarginQ: relabel(operatingMarginQ),
      operatingMarginTtm: relabel(operatingMarginTtm),
      operatingMarginFy: relabel(operatingMarginFy),
      // FY 本來就是總額口徑，但版本號跟著 metricCode 走（同一支指標的列不能混 v1／v2），見 computeDupontFamily.ts。
      netProfitMarginFy: withNetProfitMarginVersion(relabel(netProfitMarginFy)),
    },
  };
};
