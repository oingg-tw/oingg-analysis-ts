import { getPriceAnchorDate, type PriceAnchorSource } from '@/shared/sourceData/reportAnnouncementDate';

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

// 通用「knowledge_date 傳染」：給一份指標依賴的財報清單（Q/Q_ANN 傳 1 份、TTM 傳 4 份），
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
