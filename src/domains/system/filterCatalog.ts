// 靜態登錄檔：列出目前資料庫裡「已實作」的指標欄位，給前端組 filter UI 用。
// 顆粒度是「欄位」層級（例如 grossMarginQuarterly / grossMarginTtm 分開列），
// 因為同一個比率的單季/TTM 口徑是資料庫裡兩個不同欄位，各自才是可以拿來 filter 的最小單位。
// key 對應 src/domains 底下的資料夾/檔案結構，跟各分類 README 的「指標清單」表格一一對應——
// 只列 ✅ 已實作的，未實作的指標不會出現在這裡（沒有資料可以 filter）。
// 新增指標時記得同步更新這裡，不然新指標不會出現在 /filters。

export type FilterFieldPeriod = 'quarterly' | 'quarterlyAnnualized' | 'ttm' | 'snapshot' | 'daily';

export interface FilterField {
  /** 對應該指標 API 回應 JSON 裡的欄位名稱 */
  key: string;
  name: string;
  period: FilterFieldPeriod;
}

export interface FilterMetric {
  /** 對應 src/domains/<category>/<key> 資料夾名稱 */
  key: string;
  name: string;
  /** GET route path */
  path: string;
  fields: FilterField[];
}

export interface FilterCategory {
  /** 對應 src/domains/<key> 資料夾名稱 */
  key: string;
  name: string;
  metrics: FilterMetric[];
}

export const filterCatalog: FilterCategory[] = [
  {
    key: 'profitability',
    name: '獲利能力與資本配置效率',
    metrics: [
      {
        key: 'eps',
        name: '每股盈餘（EPS）',
        path: '/profitability/eps',
        fields: [
          { key: 'epsQuarterly', name: 'EPS（單季）', period: 'quarterly' },
          { key: 'epsQuarterlyAnnualized', name: 'EPS（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'epsTtm', name: 'EPS（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'bvps',
        name: '每股淨值（BVPS）',
        path: '/profitability/bvps',
        fields: [{ key: 'bvps', name: '每股淨值（BVPS）', period: 'snapshot' }],
      },
      {
        key: 'revenuePerShare',
        name: '每股營收',
        path: '/profitability/revenue-per-share',
        fields: [
          { key: 'revenuePerShareQuarterly', name: '每股營收（單季）', period: 'quarterly' },
          { key: 'revenuePerShareQuarterlyAnnualized', name: '每股營收（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'revenuePerShareTtm', name: '每股營收（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'margins',
        name: '毛利率／營業利益率／稅後淨利率',
        path: '/profitability/margins',
        fields: [
          { key: 'grossMarginQuarterly', name: '毛利率（單季）', period: 'quarterly' },
          { key: 'grossMarginTtm', name: '毛利率（TTM）', period: 'ttm' },
          { key: 'operatingMarginQuarterly', name: '營業利益率（單季）', period: 'quarterly' },
          { key: 'operatingMarginTtm', name: '營業利益率（TTM）', period: 'ttm' },
          { key: 'netProfitMarginQuarterly', name: '稅後淨利率（單季）', period: 'quarterly' },
          { key: 'netProfitMarginTtm', name: '稅後淨利率（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'roe',
        name: '股東權益報酬率（ROE）',
        path: '/profitability/roe',
        fields: [
          { key: 'roeQuarterlyPct', name: 'ROE（單季）', period: 'quarterly' },
          { key: 'roeQuarterlyAnnualizedPct', name: 'ROE（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'roeTtmPct', name: 'ROE（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'roa',
        name: '總資產報酬率（ROA）',
        path: '/profitability/roa',
        fields: [
          { key: 'roaQuarterlyPct', name: 'ROA（單季）', period: 'quarterly' },
          { key: 'roaQuarterlyAnnualizedPct', name: 'ROA（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'roaTtmPct', name: 'ROA（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'roic',
        name: '投入資本回報率（ROIC）',
        path: '/profitability/roic',
        fields: [
          { key: 'roicQuarterlyPct', name: 'ROIC（單季）', period: 'quarterly' },
          { key: 'roicQuarterlyAnnualizedPct', name: 'ROIC（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'roicTtmPct', name: 'ROIC（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'roce',
        name: '使用資本報酬率（ROCE）',
        path: '/profitability/roce',
        fields: [
          { key: 'roceQuarterlyPct', name: 'ROCE（單季）', period: 'quarterly' },
          { key: 'roceQuarterlyAnnualizedPct', name: 'ROCE（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'roceTtmPct', name: 'ROCE（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'dupont',
        name: '杜邦分析（3 步拆解 ROE）',
        path: '/profitability/dupont',
        fields: [
          { key: 'netProfitMarginQuarterly', name: '淨利率（單季）', period: 'quarterly' },
          { key: 'netProfitMarginTtm', name: '淨利率（TTM）', period: 'ttm' },
          { key: 'assetTurnoverQuarterly', name: '總資產週轉率（單季）', period: 'quarterly' },
          { key: 'assetTurnoverTtm', name: '總資產週轉率（TTM）', period: 'ttm' },
          { key: 'equityMultiplier', name: '權益乘數', period: 'snapshot' },
          { key: 'decomposedRoeQuarterlyPct', name: '組裝 ROE（單季）', period: 'quarterly' },
          { key: 'decomposedRoeTtmPct', name: '組裝 ROE（TTM）', period: 'ttm' },
          { key: 'actualRoeQuarterlyPct', name: '實際 ROE（單季，引用自 roe/）', period: 'quarterly' },
          { key: 'actualRoeTtmPct', name: '實際 ROE（TTM，引用自 roe/）', period: 'ttm' },
        ],
      },
      {
        key: 'dividendPayoutRatio',
        name: '配息率',
        path: '/profitability/dividend-payout-ratio',
        fields: [{ key: 'payoutRatioTtm', name: '配息率（TTM）', period: 'ttm' }],
      },
      {
        key: 'sgr',
        name: '可持續成長率（SGR）',
        path: '/profitability/sgr',
        fields: [{ key: 'sgrTtm', name: 'SGR（TTM）', period: 'ttm' }],
      },
    ],
  },
  {
    key: 'cashFlow',
    name: '現金流品質與法證會計防雷',
    metrics: [
      {
        key: 'cashFlowPerShare',
        name: '每股營業現金流／每股自由現金流',
        path: '/cash-flow/cash-flow-per-share',
        fields: [
          { key: 'ocfPerShareQuarterly', name: '每股營業現金流 OCF（單季）', period: 'quarterly' },
          { key: 'ocfPerShareQuarterlyAnnualized', name: '每股營業現金流 OCF（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'ocfPerShareTtm', name: '每股營業現金流 OCF（TTM）', period: 'ttm' },
          { key: 'fcfPerShareQuarterly', name: '每股自由現金流 FCF（單季）', period: 'quarterly' },
          { key: 'fcfPerShareQuarterlyAnnualized', name: '每股自由現金流 FCF（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'fcfPerShareTtm', name: '每股自由現金流 FCF（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'ocfToNetIncome',
        name: '營運現金流對淨利比',
        path: '/cash-flow/ocf-to-net-income',
        fields: [
          { key: 'ocfToNetIncomeQuarterly', name: '營運現金流對淨利比（單季）', period: 'quarterly' },
          { key: 'ocfToNetIncomeTtm', name: '營運現金流對淨利比（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'accrualsRatio',
        name: '應計項目比率',
        path: '/cash-flow/accruals-ratio',
        fields: [
          { key: 'accrualsRatioQuarterly', name: '應計項目比率（單季）', period: 'quarterly' },
          { key: 'accrualsRatioQuarterlyAnnualized', name: '應計項目比率（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'accrualsRatioTtm', name: '應計項目比率（TTM）', period: 'ttm' },
        ],
      },
    ],
  },
  {
    key: 'solvency',
    name: '財務結構、償債安全與破產預警',
    metrics: [
      {
        key: 'liquidityRatio',
        name: '流動比率／速動比率／現金比率',
        path: '/solvency/liquidity-ratio',
        fields: [
          { key: 'currentRatioPct', name: '流動比率', period: 'snapshot' },
          { key: 'quickRatioPct', name: '速動比率', period: 'snapshot' },
          { key: 'cashRatioPct', name: '現金比率', period: 'snapshot' },
        ],
      },
      {
        key: 'debtRatio',
        name: '資產負債率',
        path: '/solvency/debt-ratio',
        fields: [{ key: 'debtRatioPct', name: '資產負債率', period: 'snapshot' }],
      },
      {
        key: 'deRatio',
        name: '負債權益比',
        path: '/solvency/de-ratio',
        fields: [{ key: 'deRatioPct', name: '負債權益比', period: 'snapshot' }],
      },
      {
        key: 'interestCoverage',
        name: '利息保障倍數',
        path: '/solvency/interest-coverage',
        fields: [
          { key: 'interestCoverageQuarterly', name: '利息保障倍數（單季）', period: 'quarterly' },
          { key: 'interestCoverageTtm', name: '利息保障倍數（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'netDebtToEbitda',
        name: '淨負債對 EBITDA 比',
        path: '/solvency/net-debt-to-ebitda',
        fields: [
          { key: 'netDebtToEbitdaQuarterlyAnnualized', name: '淨負債對 EBITDA 比（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'netDebtToEbitdaTtm', name: '淨負債對 EBITDA 比（TTM）', period: 'ttm' },
        ],
      },
    ],
  },
  {
    key: 'turnover',
    name: '營運週轉與資產效率',
    metrics: [
      {
        key: 'turnoverRatio',
        name: '存貨／應收帳款／總資產／固定資產周轉率',
        path: '/turnover/turnover-ratio',
        fields: [
          { key: 'inventoryTurnoverQuarterly', name: '存貨周轉率（單季）', period: 'quarterly' },
          { key: 'inventoryTurnoverQuarterlyAnnualized', name: '存貨周轉率（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'inventoryTurnoverTtm', name: '存貨周轉率（TTM）', period: 'ttm' },
          { key: 'receivablesTurnoverQuarterly', name: '應收帳款周轉率（單季）', period: 'quarterly' },
          { key: 'receivablesTurnoverQuarterlyAnnualized', name: '應收帳款周轉率（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'receivablesTurnoverTtm', name: '應收帳款周轉率（TTM）', period: 'ttm' },
          { key: 'assetTurnoverQuarterly', name: '總資產周轉率（單季）', period: 'quarterly' },
          { key: 'assetTurnoverQuarterlyAnnualized', name: '總資產周轉率（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'assetTurnoverTtm', name: '總資產周轉率（TTM）', period: 'ttm' },
          { key: 'fixedAssetTurnoverQuarterly', name: '固定資產周轉率（單季）', period: 'quarterly' },
          { key: 'fixedAssetTurnoverQuarterlyAnnualized', name: '固定資產周轉率（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'fixedAssetTurnoverTtm', name: '固定資產周轉率（TTM）', period: 'ttm' },
          { key: 'payablesTurnoverQuarterly', name: '應付帳款周轉率（單季）', period: 'quarterly' },
          { key: 'payablesTurnoverQuarterlyAnnualized', name: '應付帳款周轉率（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'payablesTurnoverTtm', name: '應付帳款周轉率（TTM）', period: 'ttm' },
          { key: 'inventoryDaysQuarterlyAnnualized', name: 'DIO 存貨週轉天數（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'inventoryDaysTtm', name: 'DIO 存貨週轉天數（TTM）', period: 'ttm' },
          { key: 'receivablesDaysQuarterlyAnnualized', name: 'DSO 應收帳款週轉天數（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'receivablesDaysTtm', name: 'DSO 應收帳款週轉天數（TTM）', period: 'ttm' },
          { key: 'payablesDaysQuarterlyAnnualized', name: 'DPO 應付帳款週轉天數（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'payablesDaysTtm', name: 'DPO 應付帳款週轉天數（TTM）', period: 'ttm' },
          { key: 'cashConversionCycleQuarterlyAnnualized', name: 'CCC 現金轉換週期（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'cashConversionCycleTtm', name: 'CCC 現金轉換週期（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'capexToRevenue',
        name: '資本支出佔營收比',
        path: '/turnover/capex-to-revenue',
        fields: [
          { key: 'capexToRevenueQuarterly', name: '資本支出佔營收比（單季）', period: 'quarterly' },
          { key: 'capexToRevenueTtm', name: '資本支出佔營收比（TTM）', period: 'ttm' },
        ],
      },
    ],
  },
  {
    key: 'valuation',
    name: '估值與市場定價指標',
    metrics: [
      {
        key: 'marketRatios',
        name: '本益比／股價淨值比／股息殖利率',
        path: '/valuation/market-ratios',
        fields: [
          { key: 'peRatio', name: '本益比（PER）', period: 'daily' },
          { key: 'pbRatio', name: '股價淨值比（PBR）', period: 'daily' },
          { key: 'dividendYieldPct', name: '股息殖利率', period: 'daily' },
        ],
      },
    ],
  },
  {
    key: 'guru',
    name: '大師策略與複合量化估值模型',
    metrics: [
      {
        key: 'grahamNumber',
        name: '葛拉漢數（Graham Number）',
        path: '/guru/graham-number',
        fields: [{ key: 'grahamNumber', name: '葛拉漢數', period: 'ttm' }],
      },
      {
        key: 'ncav',
        name: '葛拉漢淨流動資產價值（Graham NCAV）',
        path: '/guru/ncav',
        fields: [
          { key: 'ncav', name: 'NCAV（淨流動資產價值）', period: 'snapshot' },
          { key: 'marginOfSafetyPrice', name: '安全邊際價', period: 'snapshot' },
        ],
      },
      {
        key: 'ownerEarnings',
        name: '股東盈餘（每股，Buffett Owner Earnings）',
        path: '/guru/owner-earnings',
        fields: [
          { key: 'ownerEarningsPerShareQuarterly', name: '每股股東盈餘（單季）', period: 'quarterly' },
          { key: 'ownerEarningsPerShareQuarterlyAnnualized', name: '每股股東盈餘（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'ownerEarningsPerShareTtm', name: '每股股東盈餘（TTM）', period: 'ttm' },
        ],
      },
      {
        key: 'altmanZScore',
        name: '奧特曼 Z 分數（Altman Z-Score，原始版）',
        path: '/guru/altman-z-score',
        fields: [
          { key: 'zScore', name: 'Z 分數', period: 'snapshot' },
          { key: 'x1', name: 'X1（營運資金/總資產）', period: 'snapshot' },
          { key: 'x2', name: 'X2（保留盈餘/總資產）', period: 'snapshot' },
          { key: 'x3', name: 'X3（EBIT TTM/總資產）', period: 'ttm' },
          { key: 'x4', name: 'X4（股權市值/總負債）', period: 'daily' },
          { key: 'x5', name: 'X5（營收 TTM/總資產）', period: 'ttm' },
        ],
      },
      {
        key: 'piotroskiFScore',
        name: '皮爾托斯基 F 分數（Piotroski F-Score）',
        path: '/guru/piotroski-f-score',
        fields: [{ key: 'score', name: 'F 分數（0~9）', period: 'snapshot' }],
      },
      {
        key: 'beneishMScore',
        name: '貝尼許 M 分數（Beneish M-Score）',
        path: '/guru/beneish-m-score',
        fields: [
          { key: 'mScore', name: 'M 分數', period: 'snapshot' },
          { key: 'dsri', name: 'DSRI（應收帳款指數）', period: 'snapshot' },
          { key: 'gmi', name: 'GMI（毛利率指數）', period: 'snapshot' },
          { key: 'aqi', name: 'AQI（資產品質指數）', period: 'snapshot' },
          { key: 'sgi', name: 'SGI（營收成長指數）', period: 'snapshot' },
          { key: 'depi', name: 'DEPI（折舊指數）', period: 'snapshot' },
          { key: 'sgai', name: 'SGAI（管銷費用指數）', period: 'snapshot' },
          { key: 'tata', name: 'TATA（總應計利潤對總資產比）', period: 'snapshot' },
          { key: 'lvgi', name: 'LVGI（槓桿指數）', period: 'snapshot' },
        ],
      },
      {
        key: 'nissimPenmanRnoa',
        name: 'Nissim & Penman RNOA 拆解',
        path: '/guru/nissim-penman-rnoa',
        fields: [
          { key: 'rnoaQuarterlyPct', name: 'RNOA（本業報酬率，單季）', period: 'quarterly' },
          { key: 'rnoaQuarterlyAnnualizedPct', name: 'RNOA（單季年化）', period: 'quarterlyAnnualized' },
          { key: 'rnoaTtmPct', name: 'RNOA（TTM）', period: 'ttm' },
          { key: 'flev', name: 'FLEV（財務槓桿）', period: 'snapshot' },
          { key: 'nbcQuarterlyPct', name: 'NBC（淨借貸利率，單季）', period: 'quarterly' },
          { key: 'nbcTtmPct', name: 'NBC（TTM）', period: 'ttm' },
          { key: 'spreadQuarterlyPct', name: 'SPREAD（單季）', period: 'quarterly' },
          { key: 'spreadTtmPct', name: 'SPREAD（TTM）', period: 'ttm' },
          { key: 'reconstructedRoeQuarterlyPct', name: '組裝 ROE（單季）', period: 'quarterly' },
          { key: 'reconstructedRoeTtmPct', name: '組裝 ROE（TTM）', period: 'ttm' },
          { key: 'actualRoeQuarterlyPct', name: '實際 ROE（單季，引用自 roe/）', period: 'quarterly' },
          { key: 'actualRoeTtmPct', name: '實際 ROE（TTM，引用自 roe/）', period: 'ttm' },
        ],
      },
    ],
  },
  {
    key: 'portfolio',
    name: '投資組合風險、超額報酬與量化因子',
    metrics: [
      {
        key: 'beta',
        name: '貝塔係數（Beta）',
        path: '/portfolio/beta',
        fields: [
          { key: 'beta1Y', name: 'Beta（1 年）', period: 'daily' },
          { key: 'beta2Y', name: 'Beta（2 年）', period: 'daily' },
          { key: 'beta5Y', name: 'Beta（5 年）', period: 'daily' },
        ],
      },
    ],
  },
];
