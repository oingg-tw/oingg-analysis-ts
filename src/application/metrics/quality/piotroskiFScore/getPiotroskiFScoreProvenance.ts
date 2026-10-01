import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolvePiotroskiFScoreSignals, type PiotroskiFScoreDeps, type PiotroskiFScoreSignals, type QuarterData } from './computePiotroskiFScore';
import { PIOTROSKI_GROUP_METADATA, PIOTROSKI_SIGNAL_LABELS, type PiotroskiGroupMetadata } from './piotroskiFScoreGroupMetadata';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-10-01 使用者要求溯源表全部補齊（「溯源表請務必都加上」）——2026-09-10 當時因為已有 GET /companies/piotroski-breakdown
// 而刻意不做的那個例外就此取消。跟 breakdown 端點、寫入路徑三方共用 resolvePiotroskiFScoreSignals，不另算一份：
// value 就是寫入的 0~9 分；9 個訊號依論文順序列成 type 'other'（值 1 = 符合、0 = 不符合、null = 算不出來），
// 訊號標籤直接沿用 breakdown 的 PIOTROSKI_SIGNAL_LABELS（i18n 來源同一份）；接著列本季、去年同季各自的原始欄位。
// 9 個訊號全部算得出來才有分數（任一 null → 整體 null），跟寫入路徑一致。

// 分組跟 getPiotroskiFScoreBreakdown.ts 的 groups 一致（論文順序：前 4／中 3／後 2）。
const SIGNAL_GROUP: Record<keyof PiotroskiFScoreSignals, PiotroskiGroupMetadata['key']> = {
  positiveRoa: 'profitability',
  positiveCfo: 'profitability',
  roaImproved: 'profitability',
  accrualQuality: 'profitability',
  leverageDecreased: 'leverageLiquidity',
  liquidityImproved: 'leverageLiquidity',
  noDilution: 'leverageLiquidity',
  grossMarginImproved: 'operatingEfficiency',
  assetTurnoverImproved: 'operatingEfficiency',
};
const groupNameOf = (key: keyof PiotroskiFScoreSignals): string => PIOTROSKI_GROUP_METADATA.find((g) => g.key === SIGNAL_GROUP[key])!.name;

const buildQuarterEntries = (label: string, fiscalYear: number, fiscalQuarter: number, data: QuarterData, sharesNote: string): ProvenanceEntry[] => {
  const at = { fiscalYear, fiscalQuarter, sourceDescription: null };
  return [
    { role: `${label}總資產（ROA／長期負債比率／資產週轉率分母）`, ...at, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', value: toProvenanceEntryValue(data.totalAssets) },
    { role: `${label}長期借款（缺漏視為 0）`, ...at, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'longterm_borrowings', value: toProvenanceEntryValue(data.longTermBorrowings) },
    { role: `${label}流動資產`, ...at, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', value: toProvenanceEntryValue(data.currentAssets) },
    { role: `${label}流動負債`, ...at, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_liabilities', value: toProvenanceEntryValue(data.currentLiabilities) },
    { role: `${label}淨利（歸屬母公司優先，缺漏退回整體口徑）`, ...at, type: 'statementField', statementType: 'incomeStatement', fieldKey: data.netIncomeFieldKey, value: toProvenanceEntryValue(data.netIncome) },
    { role: `${label}營業收入`, ...at, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'revenue', value: toProvenanceEntryValue(data.operatingRevenue) },
    { role: `${label}毛利`, ...at, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'gross_profit', value: toProvenanceEntryValue(data.grossProfit) },
    { role: `${label}營業活動現金流`, ...at, type: 'statementField', statementType: 'cashFlowStatement', fieldKey: 'cash_flows_from_used_in_operating_activities', value: toProvenanceEntryValue(data.operatingCashFlow) },
    { role: `${label}流通在外普通股數`, fiscalYear, fiscalQuarter, type: 'other', statementType: null, fieldKey: null, sourceDescription: sharesNote, value: toProvenanceEntryValue(data.outstandingCommonShares) },
  ];
};

export const getPiotroskiFScoreProvenance = async (query: QuarterlyMetricQuery, deps: PiotroskiFScoreDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolvePiotroskiFScoreSignals(query, deps);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'piotroskiFScore', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, signals, score, curr, prev, priorRocYear, priorSeason, splitFactor } = resolution;

  const signalEntries = (Object.keys(signals) as (keyof PiotroskiFScoreSignals)[]).map(
    (key): ProvenanceEntry => ({
      role: `訊號（${groupNameOf(key)}）：${PIOTROSKI_SIGNAL_LABELS[key]}`,
      fiscalYear,
      fiscalQuarter,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '由下方原始欄位計算的二元訊號：1 = 符合、0 = 不符合',
      value: signals[key] === null ? null : signals[key] ? 1 : 0,
    })
  );

  const sharesSource = '公開發行公司股本變動申報（財報期末日當下）';
  const priorSharesSource = splitFactor === 1 ? sharesSource : `${sharesSource}，已乘以 ${splitFactor} 換算到本期面額基準（股票分割／配股不算發行新股）`;

  return {
    symbol,
    metricCode: 'piotroskiFScore',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: score,
    entries: [
      ...signalEntries,
      ...buildQuarterEntries('本季', fiscalYear, fiscalQuarter, curr, sharesSource),
      ...buildQuarterEntries('去年同季', rocYearToGregorian(priorRocYear), priorSeason, prev, priorSharesSource),
    ],
    methodologyNote:
      'Piotroski F-Score = 9 個二元訊號加總（Piotroski 2000），本季單季數字對去年同季比較：ROA = 淨利 ÷ 期末總資產；長期負債比率 = 長期借款 ÷ 期末總資產；' +
      '流動比率 = 流動資產 ÷ 流動負債；毛利率 = 毛利 ÷ 營收；資產週轉率 = 營收 ÷ 期末總資產。9 個訊號都算得出來才有分數，任一個算不出來整體為 null。',
  };
};
