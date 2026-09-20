import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-20 使用者決定：把原本各自獨立的兩支 O'Neil 徽章（epsCagr3yBadge「年度盈餘成長」、
// epsGrowthRateBadge「當季盈餘成長」）合併成一支，並補上原本因為門檻型別無法表達「多個指標各自門檻
// 同時達成」而漏掉的兩條（當季營收 ≥25%、ROE ≥17%）——做法是新增複合指標 oneilCanslimScore
// （0-4 分），徽章門檻「4/4」用既有的 denominator 機制，跟 piotroskiFScore 同一種設計。
//
// 四個數字的出處查證（2026-09-20）：
//   - 維基 CAN SLIM 條目逐字：C「current earnings should be up at least 25% in the most recent
//     financial quarter」、A「annual earnings growth, which should be up 25% or more over the last
//     three years」、「Annual returns on equity should be 17% or more」。
//   - AAII〈Building a Stock Screen on O'Neil's Fourth Edition of the CAN SLIM Approach〉逐字：
//     「Sales growth of at least 25% quarter over quarter」、「O'Neil looks for ROE of 17% or greater」。
//   - 當季 EPS 的門檻兩個來源有出入：AAII 依第四版原書寫「at least 18%」（書的最低可接受值），維基與
//     多數篩選器用 25%（O'Neil 書中偏好的目標值）。使用者 2026-09-20 拍板用 25%——跟 sourceUrl
//     （維基）一致，也是先前 epsGrowthRateBadge 就在用的數字；note 誠實寫出 18% 是書的下限。
// sourceUrl 用維基是因為四個數字裡它逐字有三個（C 的 25%、A 的 25%、ROE 17%），營收 25% 那條在
// AAII 頁，note 裡註明。
export const oneilCanslimScoreBadge: MetricBadge = {
  name: "O'Neil CAN SLIM 基本面",
  nameEn: "O'Neil CAN SLIM Fundamentals",
  author: "William O'Neil, 1988",
  // 2026-09-20 sourceUrl 實際 fetch 驗證：維基 CAN SLIM 條目逐字有當季 EPS 25%、三年年度 25%、ROE 17% 三個數字；營收 25% 在 AAII 第四版轉錄文（見檔頭）。
  sourceUrl: 'https://en.wikipedia.org/wiki/CAN_SLIM',
  summary: 'CAN SLIM 七條裡能用財報算的四條全部達標：當季 EPS 與營收年增都 ≥25%、三年 EPS 年化成長 ≥25%、ROE ≥17%。',
  detail:
    "William O'Neil 在《How to Make Money in Stocks》（1988 年初版，2009 年第四版）提出的 CAN SLIM 選股系統，" +
    '七個字母各代表一項條件。本徽章只涵蓋能用公開財報算的 C 與 A 兩個字母共四條：C（Current quarterly ' +
    'earnings）當季 EPS 較去年同季至少成長 25%、當季營收較去年同季至少成長 25%；A（Annual earnings growth）' +
    '過去三年 EPS 年化成長至少 25%、股東權益報酬率至少 17%。四條全部通過才亮徽章，通過幾條可從指標值' +
    '（0-4 分）看出，各條的實際數字請看 epsGrowthRate、revenueGrowthRate、epsCagr3y、roe 四支指標。' +
    "N（新產品/新高）、S（籌碼供需）、L（IBD 專有的相對強度評等）、I（法人持股）、M（大盤方向）五條本站" +
    '沒有資料或不是個股層級的屬性，不在判定範圍——所以這是 CAN SLIM 的基本面子集，不是完整系統。' +
    "O'Neil 對當季 EPS 成長在書中寫的最低可接受值是 18%，但他偏好且多數引用者採用的是 25%，這裡用 25%。",
  timeframe: 'Q',
  threshold: {
    description: '4 / 4',
    thresholdLatex: '\\mathrm{CANSLIM} = 4',
    note: "CAN SLIM 的 C（當季 EPS ≥25%、當季營收 ≥25%）與 A（三年 EPS 年化 ≥25%、ROE ≥17%）四條全部通過；當季 EPS 門檻 O'Neil 書中最低可接受值為 18%，這裡採他偏好的 25%",
    denominator: 4,
    comparator: 'gte',
    value: 4,
  },
};
