import { z } from 'zod';
import { parseChineseOrArabicNumber } from '@/shared/parseChineseOrArabicNumber';

export const attentionCriteriaDetailSchema = z.object({
  startDate: z.string().meta({ description: 'YYYY-MM-DD（西元）' }),
  endDate: z.string(),
  observationDays: z.number().nullable().meta({ description: '「等N個營業日已有M次」的N，「連續M次」沒有這個概念時是 null' }),
  times: z.number(),
});
export type AttentionCriteriaDetail = z.infer<typeof attentionCriteriaDetailSchema>;

const formatRocDate = (rocYear: string, month: string, day: string): string => {
  const year = Number(rocYear) + 1911;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

// twse-ts/tpex-ts 的 attention_history_note.criteria 是一句中文說明，可能包含多個原因子句
// 直接串接在一起（沒有分隔符），例如「115年08月27日至115年09月01日連續四次115年08月20日至
// 115年09月01日等九個營業日已有五次」其實是兩個獨立子句，不是一個。子句有兩種格式：
// 「{起}至{迄}連續{次數}次」（連續達標）、「{起}至{迄}等{營業日數}個營業日已有{次數}次」
// （N個營業日內達標M次，不要求連續）。2026-09-02 應使用者要求解析出結構化的開始/結束日期跟
// 次數，不用前端自己讀中文組出來的說明文字。
//
// 解析失敗（上游文字格式之後改變、或出現目前沒看過的第三種句型）回傳空陣列，不拋錯——
// criteria 原始字串本身還是會保留在 AttentionStockRow，前端仍然看得到完整說明文字，只是
// 少了結構化欄位，不影響整支 API 的其他資料。
const CLAUSE_PATTERN = /(\d+)年(\d{1,2})月(\d{1,2})日至(\d+)年(\d{1,2})月(\d{1,2})日(?:等([一二三四五六七八九十]+)個營業日已有|連續)([一二三四五六七八九十]+)次/g;

export const parseAttentionCriteria = (criteria: string | null): AttentionCriteriaDetail[] => {
  if (!criteria) return [];
  const details: AttentionCriteriaDetail[] = [];
  for (const match of criteria.matchAll(CLAUSE_PATTERN)) {
    const [, startYear, startMonth, startDay, endYear, endMonth, endDay, observationDaysText, timesText] = match;
    details.push({
      startDate: formatRocDate(startYear!, startMonth!, startDay!),
      endDate: formatRocDate(endYear!, endMonth!, endDay!),
      observationDays: observationDaysText ? parseChineseOrArabicNumber(observationDaysText) : null,
      times: parseChineseOrArabicNumber(timesText!),
    });
  }
  return details;
};
