// 產品內建的策展預設 view——2026-09-01 應使用者要求新增，跟使用者自己客製化的欄位選擇
// （那種純粹是前端/bff-ts 的個人 UI 偏好狀態，不需要 analysis-ts 參與）不同：這裡是產品設計好、
// 固定的組合，give 一個名字、給使用者「一鍵套用」用，不是使用者自己勾選出來的。
//
// `fieldKeys` 直接對應 filterCatalog.ts 裡各 field 的 `key`，故意不分 category/metric——
// 前端拿到 key 之後去掃過整份 filterCatalog 找出對應的 field 定義（name/unit/period 等）即可，
// 不需要在這裡重複描述一次。少數 key 同時存在於兩個 metric 底下（例如 netProfitMarginQuarterly
// 同時是 margins 跟 dupont 的欄位，兩邊定義完全一樣，見 filterCatalogCheck.ts 對這種情況的說明），
// 前端隨便挑其中一個顯示都可以，不影響資料本身。
//
// 新增/修改 filterCatalog.ts 的 field key（改名、刪除）時，記得回來對照這份清單有沒有跟著失效——
// 目前沒有自動化的一致性檢查（不像 filterCatalogCheck.ts 對 schema.prisma 那樣），是已知的手動維護點。
export interface ColumnPreset {
  key: string;
  name: string;
  description: string;
  fieldKeys: string[];
}

export const columnPresets: ColumnPreset[] = [
  {
    key: 'dividendIncome',
    name: '存股領息',
    description: '殖利率、配息穩定度，搭配基本獲利能力與償債能力，適合追求穩定現金股利的投資人',
    fieldKeys: ['dividendYieldPct', 'payoutRatioTtm', 'roeTtmPct', 'debtRatioPct', 'currentRatioPct'],
  },
  {
    key: 'valueInvesting',
    name: '價值投資',
    description: '葛拉漢風格的保守估價指標組合，找股價相對便宜、有安全邊際的標的',
    fieldKeys: ['peRatio', 'pbRatio', 'ncav', 'marginOfSafetyPrice', 'grahamNumber', 'debtRatioPct'],
  },
  {
    key: 'financialHealth',
    name: '財務體質排雷',
    description: '破產/財報異常統計預警模型，搭配基本償債能力指標，篩掉體質有疑慮的公司',
    fieldKeys: ['zScore', 'mScore', 'score', 'debtRatioPct', 'currentRatioPct', 'interestCoverageTtm'],
  },
  {
    key: 'profitabilityQuality',
    name: '獲利品質拆解',
    description: '杜邦拆解 ROE 的驅動來源，搭配現金流有沒有真的支撐帳面獲利，判斷獲利是不是虛的',
    fieldKeys: ['netProfitMarginQuarterly', 'assetTurnoverQuarterly', 'equityMultiplier', 'decomposedRoeQuarterlyPct', 'ocfToNetIncomeQuarterly', 'accrualsRatioQuarterly'],
  },
  {
    key: 'growthOriented',
    name: '成長型',
    description: '獲利能力與資產運用效率，適合觀察本業持續成長的公司',
    fieldKeys: ['revenuePerShareTtm', 'roeTtmPct', 'roicTtmPct', 'grossMarginTtm', 'operatingMarginTtm'],
  },
  {
    key: 'technicalTrading',
    name: '技術面短線',
    description: '均線、動能、波動區間指標組合，適合短線進出場判斷',
    fieldKeys: ['ma20d', 'ma60d', 'rsi14d', 'k9d', 'd9d', 'dif', 'dem', 'bias20d', 'atr14d'],
  },
];
