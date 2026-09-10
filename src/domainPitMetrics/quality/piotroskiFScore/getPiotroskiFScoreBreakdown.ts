import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolvePiotroskiFScoreSignals } from './computePiotroskiFScorePit';

// 2026-09-10 web-nuxt 要求：依 Piotroski (2000) 原始論文的分組把 9 個訊號拆成 3 組顯示
// （獲利能力/財務槓桿與流動性/營運效率），不是新的 metric_code——現查現算，不持久化，
// 因為這 9 個訊號本來就不是可獨立篩選的指標。分組本身只是把 resolvePiotroskiFScoreSignals()
// 算好的 9 個訊號依論文順序分堆，不重新計算，也不幫呼叫端算組內子分數（web-nuxt 自己算，
// 只是分組+計數這種瑣碎算術）。

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
}

export const getPiotroskiFScoreBreakdown = async (query: QuarterlyMetricQuery): Promise<PiotroskiFScoreBreakdown> => {
  const resolution = await resolvePiotroskiFScoreSignals(query);

  if (!resolution) {
    return { symbol: query.symbol, found: false, fiscalYear: null, fiscalQuarter: null, knowledgeDate: null, knowledgeDateIsFallback: null, totalScore: null, groups: null };
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
  };
};
