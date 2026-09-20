// 2026-09-11 web-nuxt 要求（i18n 為真正的驅動因素，不是單純方便）：3 個子徽章
// （獲利能力/財務槓桿與流動性/營運效率）各自的 name/summary/detail，以及 9 個訊號各自的
// 顯示標籤，原本寫死在 web-nuxt 前端的 guru-badges.ts，任何硬寫的中文字串都擋掉未來
// 多語系翻譯。
//
// 2026-09-19 使用者決定 Piotroski 合併回「一個指標、一個徽章」（piotroskiFScoreBadge.ts 現在
// 有真正的門檻 gte 8，走 GET /companies/badges 的通用判定），「3 個子徽章」這個呈現方式退場——
// 這裡的 3 組 metadata 從「子徽章文案」變成「單一徽章的明細對話框裡 3 個分組區塊的標題/說明」，
// 9 個訊號標籤不受影響。web-nuxt 同日確認 groupMetadata/signalLabels 兩個欄位都仍在使用
// （合併後的單一徽章展開時，9 項訊號依這 3 組分區塊呈現），**不要拿掉**，GET /companies/
// piotroski-breakdown 的回應形狀維持不變。
//
// 這份 metadata 刻意「不」塞進 MetricBadge/MetricDefinitionSpec 這兩個被 94 支指標/12
// 支 badge 共用的型別——「9 個訊號拆 3 組」這件事只有 Piotroski F-Score 這一支指標有，
// 其餘 11 支 badge 完全沒有「子分組」概念，硬把 groups/signalLabels 塞進共用型別等於為了
// 一個特例污染所有消費端都要處理的通用形狀。改成獨立的專屬檔案，只給
// getPiotroskiFScoreBreakdown.ts（GET /companies/piotroski-breakdown）用，跟
// piotroskiFScoreBadge.ts（GET /metrics 的 badge 欄位，描述整體 9 訊號加總）完全分開
// 維護，兩者刻意不互相衍生——真的有一天其他指標也出現同樣的「拆組」需求，再回頭評估
// 要不要抽成共用型別，現在只有一個消費者，不用預先設計。

export interface PiotroskiGroupMetadata {
  key: 'profitability' | 'leverageLiquidity' | 'operatingEfficiency';
  name: string;
  nameEn: string;
  summary: string;
  detail: string;
  denominator: number;
}

export const PIOTROSKI_GROUP_METADATA: readonly PiotroskiGroupMetadata[] = [
  {
    key: 'profitability',
    name: '獲利能力',
    nameEn: 'Profitability',
    summary: '公司本業有沒有在賺錢、賺得比去年好——看的是獲利的「有無」跟「是否改善」，不是獲利的絕對規模。',
    detail:
      '對應 Piotroski (2000) 原始論文的 4 個獲利能力訊號：資產報酬率（ROA）是否為正、營業現金流' +
      '是否為正、ROA 是否較去年同季提升，以及營業現金流是否大於淨利（用來判斷帳面獲利有沒有' +
      '實際變現，是應計項目品質的簡易檢查）。4 項全數符合代表公司不只帳面有賺錢，賺到的錢也' +
      '真的變成現金，而且比去年同期改善。',
    denominator: 4,
  },
  {
    key: 'leverageLiquidity',
    name: '財務槓桿與流動性',
    nameEn: 'Leverage, Liquidity & Source of Funds',
    summary: '公司償債能力有沒有變好、有沒有靠稀釋股權籌資——看的是財務結構的抗風險程度，不是規模大小。',
    detail:
      '對應原始論文的 3 個財務結構訊號：長期負債占總資產比率是否較去年同季下降（財務槓桿是否' +
      '降低）、流動比率是否較去年同季提升（短期償債能力是否改善），以及流通股數是否維持不變' +
      '或減少（公司是否靠發行新股稀釋既有股東權益來籌資）。3 項全數符合代表公司財務結構的' +
      '抗風險程度正在提升，不是靠舉債或稀釋股權硬撐。',
    denominator: 3,
  },
  {
    key: 'operatingEfficiency',
    name: '營運效率',
    nameEn: 'Operating Efficiency',
    summary: '公司賺錢的效率（毛利率）跟資產運用的效率（週轉率）有沒有比去年好。',
    detail:
      '對應原始論文的 2 個營運效率訊號：毛利率是否較去年同季提升、總資產週轉率（營收 ÷ 總資產，' +
      '衡量資產創造營收的效率）是否較去年同季提升。2 項全數符合代表公司不只賺得比較多，本業' +
      '本身的經營效率也在改善，不是單純靠外部因素帶動獲利。',
    denominator: 2,
  },
] as const;

export const PIOTROSKI_SIGNAL_LABELS: Readonly<Record<string, string>> = {
  positiveRoa: '資產報酬率（ROA）為正',
  positiveCfo: '營業現金流為正',
  roaImproved: 'ROA 較去年同季提升',
  accrualQuality: '營業現金流大於淨利（應計項目品質良好）',
  leverageDecreased: '長期負債比率較去年同季下降',
  liquidityImproved: '流動比率較去年同季提升',
  noDilution: '流通股數未增加（無股權稀釋）',
  grossMarginImproved: '毛利率較去年同季提升',
  assetTurnoverImproved: '總資產週轉率較去年同季提升',
};
