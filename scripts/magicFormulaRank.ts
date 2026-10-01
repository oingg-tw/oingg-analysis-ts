import { persistMetricValue } from '../src/bootstrap/pitMetrics';
import { periodTypeGroup } from '../src/domain/metrics/coordinate';
import { rankDescending } from '../src/domain/metrics/valuation/magicFormulaRank/calculateMagicFormulaRank';
import { backfillUniverse, analysisQueries, reportAvailability } from '../src/bootstrap/scripts';

// 2026-10-01 從 backfillMagicFormulaRankPit.ts 抽出「排名＋寫入」兩步，給上游變動處理程式（processUpstreamChangesPit.ts）共用。
// 使用者要求「神奇公式排名要接進每日自動重算」：magicFormulaRank 是全市場橫斷面排名，任何一家的 greenblattRoc／
// greenblattEarningsYield 變了，所有人的名次都可能變；之前只有手動回填腳本會重排，DEV 上 09-15 排的 630 家到 10-01 都沒動過
// （同期底層兩支已重算到 1,874 家可排名），排名悄悄過期、不報錯。
// 這裡只讀兩支底層指標的「全市場最新一筆 TTM」再排名，不重算底層——底層由呼叫端負責（回填腳本步驟 1、處理程式的季報重算）。
// 名次寫在 greenblattRoc 那一筆的座標（fiscalYear/fiscalQuarter/knowledgeDate），名次沒變的列 skipped_unchanged，所以每天重排的寫入量
// 只有真的變動的公司。
export const rankAndWriteMagicFormula = async (logPrefix: string): Promise<{ rankable: number; written: number; rejected: number; actions: Record<string, number> }> => {
  const [rocRows, eyRows] = await Promise.all([analysisQueries.listLatestTtmValuesAcrossMarket('greenblattRoc'), analysisQueries.listLatestTtmValuesAcrossMarket('greenblattEarningsYield')]);
  const rocValues = new Map(rocRows.map((r) => [r.symbol, r]));
  const eyValues = new Map(eyRows.map((r) => [r.symbol, r]));
  const eligibleSymbols = [...rocValues.keys()].filter((s) => eyValues.has(s));
  const financialFlags = await Promise.all(eligibleSymbols.map((s) => backfillUniverse.isFinancialIndustryCompany(s)));
  const rankableSymbols = eligibleSymbols.filter((_, i) => !financialFlags[i]);
  console.log(`${logPrefix} 兩指標皆非 null：${eligibleSymbols.length} 家，排除金融保險業後可排名：${rankableSymbols.length} 家`);

  const rocRank = rankDescending(rankableSymbols.map((s) => [s, rocValues.get(s)!.value]));
  const eyRank = rankDescending(rankableSymbols.map((s) => [s, eyValues.get(s)!.value]));

  const actions: Record<string, number> = {};
  let rejected = 0;
  for (const symbol of rankableSymbols) {
    const roc = rocValues.get(symbol)!;
    const outcome = await persistMetricValue({
      symbol,
      metricCode: 'magicFormulaRank',
      ...periodTypeGroup('TTM'),
      fiscalYear: roc.fiscal_year,
      fiscalQuarter: roc.fiscal_quarter,
      dataType: await reportAvailability.resolveDataType(symbol),
      subsidiaryCompanyId: '',
      value: rocRank.get(symbol)! + eyRank.get(symbol)!,
      nullReason: null,
      knowledgeDate: roc.knowledge_date,
      knowledgeDateIsFallback: roc.knowledge_date_is_fallback,
    });
    actions[outcome.action] = (actions[outcome.action] ?? 0) + 1;
    if (outcome.action === 'rejected') rejected += 1;
  }
  return { rankable: rankableSymbols.length, written: rankableSymbols.length - rejected, rejected, actions };
};
