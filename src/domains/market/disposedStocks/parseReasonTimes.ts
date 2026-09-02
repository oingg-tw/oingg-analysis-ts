import { parseChineseOrArabicNumber } from '@/shared/parseChineseOrArabicNumber';

// disposed_stock.reason 的句型比 attention_history_note.criteria 雜——實測看過的樣本：
// 「連續五次」「連續三次」（中文數字+次）、「連續5個營業日」「因連續3個營業日達本中心作業
// 要點第四條第一項第一款」「連續3個營業日及沖銷標準」（阿拉伯數字+個營業日，前後可能夾雜
// 法條引用或其他文字）、「最近10個營業日內有6個營業日」（N個營業日內達標M次，不要求連續）、
// 「轉(交)換公司債之標的證券經本中心或臺灣證券交易所發布處置」（完全沒有次數概念的處置
// 原因，例如可轉債標的證券）。2026-09-02 應使用者要求，只抽「次數」這個數字出來，不解析
// dispositionPeriod 的日期（那個格式本身已經夠單純，前端自己拆就好）。
//
// 用 .match 找子字串而不要求整段字串符合格式，才能處理「因...達...」這種前後夾雜其他文字的
// 句型。解析不出次數（例如可轉債那種完全沒有數字的原因）回傳 null，不拋錯。
const OBSERVATION_PATTERN = /最近([一二三四五六七八九十\d]+)個營業日內有([一二三四五六七八九十\d]+)個營業日/;
const CONSECUTIVE_PATTERN = /連續([一二三四五六七八九十\d]+)(?:次|個營業日)/;

export const parseDispositionTimes = (reason: string | null): number | null => {
  if (!reason) return null;

  const observationMatch = reason.match(OBSERVATION_PATTERN);
  if (observationMatch) return parseChineseOrArabicNumber(observationMatch[2]!);

  const consecutiveMatch = reason.match(CONSECUTIVE_PATTERN);
  if (consecutiveMatch) return parseChineseOrArabicNumber(consecutiveMatch[1]!);

  return null;
};
