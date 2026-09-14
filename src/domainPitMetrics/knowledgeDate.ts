import { getPriceAnchorDate, type PriceAnchorSource } from '@/models/reportAnnouncementDate';

export interface QuarterAnchorInput {
  rocYear: number; // 民國年——沿用 getPriceAnchorDate 現有呼叫慣例（altmanZScore.ts 等皆傳民國年）。
  season: number; // 1~4
  reportDate: Date | null; // 該季財報期末日；查無資料傳 null
}

export interface KnowledgeDateResolution {
  knowledgeDate: Date;
  isFallback: boolean;
  perQuarter: Array<{ rocYear: number; season: number; source: PriceAnchorSource }>;
}

// 通用「knowledge_date 傳染」：給一份指標依賴的財報清單（Q 傳 1 份、TTM 傳 4 份），
// 回傳「這些財報全部公告完畢、市場才真正知道這個衍生值」的日期（= 各自公告日的最大值）。
// 任一份財報連 reportDate 都查不到（財報本身不存在）就回傳 null，呼叫端視為「沒有可用的
// knowledge_date，不寫入」。之後其他指標接 knowledge_date 傳染都呼叫這支，不要各自重寫。
export const resolveKnowledgeDate = async (symbol: string, quarters: QuarterAnchorInput[]): Promise<KnowledgeDateResolution | null> => {
  const anchors = await Promise.all(quarters.map((q) => getPriceAnchorDate(symbol, q.rocYear, q.season, q.reportDate)));
  if (anchors.some((a) => a === null)) return null;
  const resolved = anchors as NonNullable<(typeof anchors)[number]>[];
  const knowledgeDate = resolved.reduce((max, a) => (a.date > max ? a.date : max), resolved[0]!.date);
  return {
    knowledgeDate,
    isFallback: resolved.some((a) => a.source === 'report_date_fallback'),
    perQuarter: quarters.map((q, i) => ({ rocYear: q.rocYear, season: q.season, source: resolved[i]!.source })),
  };
};

export interface DailyCadenceKnowledgeDateResolution {
  knowledgeDate: Date;
  isFallback: false;
}

// 逐日型指標（未來 Beta/MarketRatios 遷入 pitMetrics 時使用，見 metricValueWriter.ts 的
// DAILY_CADENCE_FISCAL_QUARTER）的 knowledgeDate 慣例：交易日股價是公開資訊，當天收盤
// 就是市場知道的那一刻，不像季報財報有「期末日 vs 公告日」的落差，所以沒有
// resolveKnowledgeDate 那套 getPriceAnchorDate/fallback 機制可言——knowledgeDate 直接
// 等於 tradeDate，isFallback 恆為 false（沒有「查無真實公告日、退回期末日頂替」這回事）。
// 之後寫逐日型指標的 computeXxxPit.ts 應該呼叫這支，不要自己把 tradeDate 當
// knowledgeDate 硬寫，讓這條規則有唯一的程式碼依據可循，不是散落在各自檔案裡的隱規則。
export const resolveDailyCadenceKnowledgeDate = (tradeDate: Date): DailyCadenceKnowledgeDateResolution => ({
  knowledgeDate: tradeDate,
  isFallback: false,
});
