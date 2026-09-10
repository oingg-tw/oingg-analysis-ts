import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolvePiotroskiFScoreSignals } from './computePiotroskiFScorePit';
import { PIOTROSKI_GROUP_METADATA, PIOTROSKI_SIGNAL_LABELS, type PiotroskiGroupMetadata } from './piotroskiFScoreGroupMetadata';

// 2026-09-10 web-nuxt 要求：依 Piotroski (2000) 原始論文的分組把 9 個訊號拆成 3 組顯示
// （獲利能力/財務槓桿與流動性/營運效率），不是新的 metric_code——現查現算，不持久化，
// 因為這 9 個訊號本來就不是可獨立篩選的指標。分組本身只是把 resolvePiotroskiFScoreSignals()
// 算好的 9 個訊號依論文順序分堆，不重新計算，也不幫呼叫端算組內子分數（web-nuxt 自己算，
// 只是分組+計數這種瑣碎算術）。
//
// 2026-09-11 追加：groupMetadata/signalLabels 這兩個欄位是 web-nuxt 為了 i18n 提出的
// 需求——3 個子分組各自的 name/summary/detail/denominator，跟 9 個訊號各自的顯示標籤，
// 原本寫死在前端，任何硬寫字串都擋掉多語系翻譯。這兩個欄位是純靜態文字（不隨 symbol/
// 期別變化），每次都回傳同一份，來源見 piotroskiFScoreGroupMetadata.ts——那支檔案的
// 檔頭說明了為什麼這份 metadata 不放進 MetricBadge/MetricDefinitionSpec（只有這支
// 指標有「拆組」需求，不該為了一個特例污染 12 支 badge 共用的型別）。

export interface PiotroskiFScoreBreakdown {
  symbol: string;
  found: boolean;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  knowledgeDate: string | null;
  knowledgeDateIsFallback: boolean | null;
  totalScore: number | null;
  groups: {
    profitability: {
      positiveRoa: boolean | null;
      positiveCfo: boolean | null;
      roaImproved: boolean | null;
      accrualQuality: boolean | null;
    };
    leverageLiquidity: {
      leverageDecreased: boolean | null;
      liquidityImproved: boolean | null;
      noDilution: boolean | null;
    };
    operatingEfficiency: {
      grossMarginImproved: boolean | null;
      assetTurnoverImproved: boolean | null;
    };
  } | null;
  groupMetadata: readonly PiotroskiGroupMetadata[];
  signalLabels: Readonly<Record<string, string>>;
}

export const getPiotroskiFScoreBreakdown = async (query: QuarterlyMetricQuery): Promise<PiotroskiFScoreBreakdown> => {
  const resolution = await resolvePiotroskiFScoreSignals(query);

  if (!resolution) {
    return {
      symbol: query.symbol,
      found: false,
      fiscalYear: null,
      fiscalQuarter: null,
      knowledgeDate: null,
      knowledgeDateIsFallback: null,
      totalScore: null,
      groups: null,
      groupMetadata: PIOTROSKI_GROUP_METADATA,
      signalLabels: PIOTROSKI_SIGNAL_LABELS,
    };
  }

  const { symbol, fiscalYear, fiscalQuarter, signals, score, knowledgeDate, knowledgeDateIsFallback } = resolution;

  return {
    symbol,
    found: true,
    fiscalYear,
    fiscalQuarter,
    knowledgeDate: knowledgeDate ? knowledgeDate.toISOString().slice(0, 10) : null,
    knowledgeDateIsFallback,
    totalScore: score,
    groups: {
      profitability: {
        positiveRoa: signals.positiveRoa,
        positiveCfo: signals.positiveCfo,
        roaImproved: signals.roaImproved,
        accrualQuality: signals.accrualQuality,
      },
      leverageLiquidity: {
        leverageDecreased: signals.leverageDecreased,
        liquidityImproved: signals.liquidityImproved,
        noDilution: signals.noDilution,
      },
      operatingEfficiency: {
        grossMarginImproved: signals.grossMarginImproved,
        assetTurnoverImproved: signals.assetTurnoverImproved,
      },
    },
    groupMetadata: PIOTROSKI_GROUP_METADATA,
    signalLabels: PIOTROSKI_SIGNAL_LABELS,
  };
};
