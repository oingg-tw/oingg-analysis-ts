// 產品內建的策展預設 view——2026-09-01 應使用者要求新增，跟使用者自己客製化的欄位選擇
// （那種純粹是前端/bff-ts 的個人 UI 偏好狀態，不需要 analysis-ts 參與）不同：這裡是產品設計好、
// 固定的組合，給一個名字、給使用者「一鍵套用」用，不是使用者自己勾選出來的。
//
// `fieldKeys` 用 `"metricKey.fieldKey"` 格式（跟 bff-ts 既有慣例一致，2026-09-01 bff-ts
// 回報改用這個格式），不能只寫裸的 field key——filterCatalog.ts 裡有些 field key 同時存在於
// 兩個不同 metric 底下（例如 `netProfitMarginQuarterly` 同時是 `netProfitMargin` 跟 `dupont`
// 的欄位，`assetTurnoverQuarterly` 同時是 `assetTurnoverRatio` 跟 `dupont` 的欄位，兩邊定義
// 完全一樣但屬於不同 metric），裸 key 會造成前端解析歧義，一開始的 profitabilityQuality 就踩到
// 這個問題。前端拿到 `"metricKey.fieldKey"` 後去 filterCatalog 對應 metric 底下找出這個 field
// 的完整定義（name/unit/period 等）即可，不需要在這裡重複描述一次。
//
// 新增/修改 filterCatalog.ts 的 metric key、field key（改名、刪除）時，記得回來對照這份清單有
// 沒有跟著失效——目前沒有自動化的一致性檢查（不像 filterCatalogCheck.ts 對 schema.prisma 那樣），
// 是已知的手動維護點。
export interface ColumnPreset {
  key: string;
  name: string;
  description: string;
  fieldKeys: string[]; // 格式："metricKey.fieldKey"
}

export const columnPresets: ColumnPreset[] = [
  {
    key: 'dividendIncome',
    name: '存股領息',
    description: '殖利率、配息穩定度，搭配基本獲利能力與償債能力，適合追求穩定現金股利的投資人',
    fieldKeys: ['dividendYield.dividendYieldPct', 'dividendPayoutRatio.payoutRatioTtm', 'roe.roeTtmPct', 'debtRatio.debtRatioPct', 'currentRatio.currentRatioPct'],
  },
  {
    key: 'valueInvesting',
    name: '價值投資',
    description: '葛拉漢風格的保守估價指標組合，找股價相對便宜、有安全邊際的標的',
    fieldKeys: ['per.peRatio', 'pbr.pbRatio', 'ncav.ncav', 'ncav.marginOfSafetyPrice', 'grahamNumber.grahamNumber', 'debtRatio.debtRatioPct'],
  },
  {
    key: 'financialHealth',
    name: '財務體質排雷',
    description: '破產/財報異常統計預警模型，搭配基本償債能力指標，篩掉體質有疑慮的公司',
    fieldKeys: ['altmanZScore.zScore', 'beneishMScore.mScore', 'piotroskiFScore.score', 'debtRatio.debtRatioPct', 'currentRatio.currentRatioPct', 'interestCoverage.interestCoverageTtm'],
  },
  {
    key: 'profitabilityQuality',
    name: '獲利品質拆解',
    description: '杜邦拆解 ROE 的驅動來源，搭配現金流有沒有真的支撐帳面獲利，判斷獲利是不是虛的',
    fieldKeys: [
      'dupont.netProfitMarginQuarterly',
      'dupont.assetTurnoverQuarterly',
      'dupont.equityMultiplier',
      'dupont.decomposedRoeQuarterlyPct',
      'ocfToNetIncome.ocfToNetIncomeQuarterly',
      'accrualsRatio.accrualsRatioQuarterly',
    ],
  },
  {
    key: 'growthOriented',
    name: '成長型',
    description: '獲利能力與資產運用效率，適合觀察本業持續成長的公司',
    fieldKeys: ['revenuePerShare.revenuePerShareTtm', 'roe.roeTtmPct', 'roic.roicTtmPct', 'grossMargin.grossMarginTtm', 'operatingMargin.operatingMarginTtm'],
  },
  {
    key: 'technicalTrading',
    name: '技術面短線',
    description: '均線、動能、波動區間指標組合，適合短線進出場判斷',
    fieldKeys: ['ma.ma20d', 'ma.ma60d', 'rsi.rsi14d', 'kd.k9d', 'kd.d9d', 'macd.dif', 'macd.dem', 'bias.bias20d', 'atr.atr14d'],
  },
];
