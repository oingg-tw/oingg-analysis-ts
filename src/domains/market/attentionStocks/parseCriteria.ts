export interface AttentionCriteriaDetail {
  startDate: string; // YYYY-MM-DD（西元）
  endDate: string;
  observationDays: number | null; // 「等N個營業日已有M次」的N，「連續M次」沒有這個概念時是 null
  times: number;
}

const CHINESE_DIGIT: Record<string, number> = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

// 支援 0~99：個位數（例如「二」→2）跟含「十」的十位數（例如「十」→10、「十一」→11、
// 「二十三」→23）。這個欄位的次數/營業日數量級不會超過這個範圍。
const parseChineseNumber = (text: string): number => {
  if (!text.includes('十')) {
    let result = 0;
    for (const ch of text) result = result * 10 + (CHINESE_DIGIT[ch] ?? 0);
    return result;
  }
  const [tensPart, onesPart] = text.split('十');
  const tens = tensPart === '' ? 1 : (CHINESE_DIGIT[tensPart!] ?? 1);
  const ones = onesPart === '' ? 0 : (CHINESE_DIGIT[onesPart!] ?? 0);
  return tens * 10 + ones;
};

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
      observationDays: observationDaysText ? parseChineseNumber(observationDaysText) : null,
      times: parseChineseNumber(timesText!),
    });
  }
  return details;
};
