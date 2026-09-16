const CHINESE_DIGIT: Record<string, number> = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

// 支援阿拉伯數字字串（例如「3」→3）或中文數字（0~99，例如「二」→2、「十一」→11、
// 「二十三」→23）混合出現的場景——twse-ts/tpex-ts 的中文說明文字（attention_history_note.
// criteria、disposed_stock.reason）兩種數字寫法都會出現，同一批資料裡也不保證統一。
export const parseChineseOrArabicNumber = (text: string): number => {
  const asArabic = Number(text);
  if (!Number.isNaN(asArabic)) return asArabic;

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
