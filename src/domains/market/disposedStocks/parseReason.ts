import { parseChineseOrArabicNumber } from '@/shared/parseChineseOrArabicNumber';

// disposed_stock.reason 的句型比 attention_history_note.criteria 雜——實測看過的樣本：
// 「連續五次」「連續三次」（中文數字+次）、「連續5個營業日」「因連續3個營業日達本中心作業
// 要點第四條第一項第一款」「連續3個營業日及沖銷標準」（阿拉伯數字+個營業日，前後可能夾雜
// 法條引用或其他文字）、「最近10個營業日內有6個營業日」（N個營業日內達標M次，不要求連續）、
// 「轉(交)換公司債之標的證券經本中心或臺灣證券交易所發布處置」（完全沒有次數概念的處置
// 原因——這個是可轉換公司債「標的證券」被處置，不是股票本身觸發價量異常，規則跟其他 13 款
// 完全不是同一套，不能套用下面的條款對照表）。
//
// 2026-09-02 應使用者要求，只抽「次數」這個數字出來，不解析 dispositionPeriod 的日期（那個
// 格式本身已經夠單純，前端自己拆就好）。用 .match 找子字串而不要求整段字串符合格式，才能
// 處理「因...達...」這種前後夾雜其他文字的句型。解析不出次數（例如可轉債那種完全沒有數字的
// 原因）回傳 null，不拋錯。
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

// 2026-09-02 應使用者要求，把 reason 裡引用的法條款次（例如「本中心作業要點第四條第一項
// 第一款」）簡化成中文短標籤——對照表來自 twse-ts/tpex-ts 共用的「公布或通知注意交易資訊暨
// 處置作業要點」第四條第一項，逐款核對過官方條文（見 twse-regulation.twse.com.tw 公開文件），
// 上市（TWSE）跟上櫃（TPEx）這份法規名稱/架構幾乎一致，但 TPEx 官方頁面目前無法直接存取
// 逐字核對，信心程度高但不是 100% 逐字確認過 TPEx 端款次編號完全相同，之後如果發現對不上
// 要回來修正這份對照表。
//
// 「轉(交)換公司債之標的證券...」是可轉換公司債「標的證券」被處置，跟股票本身觸發價量異常
// 是完全不同的規則體系（債券連動，不是這 13 款價格/成交量/週轉率規則），不套用下面的條款
// 對照表，直接給一個獨立的短標籤。
const CLAUSE_LABEL: Record<string, string> = {
  第一款: '漲跌異常',
  第二款: '長期漲跌異常',
  第三款: '價量異常',
  第四款: '漲跌週轉異常',
  第五款: '券商集中異常',
  第六款: '本益比異常',
  第七款: '券資比異常',
  第八款: 'TDR溢折價異常',
  第九款: '成交量異常',
  第十款: '週轉率異常',
  第十一款: '價差異常',
  第十二款: '借券賣出異常',
  第十三款: '當沖比率異常',
};
const CLAUSE_PATTERN = /第(?:十[一二三]?|[一二三四五六七八九])款/;

export const parseReasonShortLabel = (reason: string | null): string | null => {
  if (!reason) return null;

  if (reason.includes('轉(交)換公司債') || reason.includes('轉換公司債') || reason.includes('交換公司債')) return '轉(交)換公司債';

  const clauseMatch = reason.match(CLAUSE_PATTERN);
  if (clauseMatch) {
    const label = CLAUSE_LABEL[clauseMatch[0]!];
    if (label) return label;
  }

  if (reason.includes('沖銷')) return '當沖比率異常';

  return null;
};

const formatRocDate = (rocYear: string, month: string, day: string): string => `${Number(rocYear) + 1911}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

// dispositionPeriod 有兩種原始格式：TWSE 是「115/08/27～115/09/02」（斜線分隔、全形波浪號），
// TPEx 是「1150827~1150902」（3碼民國年+2碼月+2碼日緊湊格式、半形波浪號）。2026-09-02
// 應使用者要求拆成 startDate/endDate 兩個西元日期欄位，解析不出來（格式之後改變）時回傳
// null，不拋錯——dispositionPeriod 原始字串本身還是會保留在 DisposedStockRow。
const parseOneDate = (part: string): string | null => {
  const trimmed = part.trim();
  const slashMatch = trimmed.match(/^(\d+)\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) return formatRocDate(slashMatch[1]!, slashMatch[2]!, slashMatch[3]!);
  const compactMatch = trimmed.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (compactMatch) return formatRocDate(compactMatch[1]!, compactMatch[2]!, compactMatch[3]!);
  return null;
};

export interface DispositionPeriod {
  startDate: string;
  endDate: string;
}

export const parseDispositionPeriod = (period: string | null): DispositionPeriod | null => {
  if (!period) return null;
  const parts = period.split(/[~～]/);
  if (parts.length !== 2) return null;

  const startDate = parseOneDate(parts[0]!);
  const endDate = parseOneDate(parts[1]!);
  if (!startDate || !endDate) return null;

  return { startDate, endDate };
};
