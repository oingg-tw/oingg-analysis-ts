// 靜態登錄檔：列出目前資料庫裡「已實作」的指標欄位，給前端組 filter UI 用。
// 顆粒度是「欄位」層級（例如 grossMarginQuarterly / grossMarginTtm 分開列），
// 因為同一個比率的單季/TTM 口徑是資料庫裡兩個不同欄位，各自才是可以拿來 filter 的最小單位。
// key 對應 src/domains 底下的資料夾/檔案結構，跟各分類 README 的「指標清單」表格一一對應——
// 只列 ✅ 已實作的，未實作的指標不會出現在這裡（沒有資料可以 filter）。
// 新增指標時記得同步更新這裡，不然新指標不會出現在 /filters。
//
// **`name` 是要直接顯示給前端使用者看的文案，不是給開發者看的內部備註**——2026-08-28 踩過一次：
// 複合指標裡引用其他服務算出來的欄位（例如 dupont/nissimPenmanRnoa 的 actualRoe*，直接引用
// roe/ 算出來的數字），一開始把 name 寫成「實際 ROE（單季，引用自 roe/）」，把「這個欄位是怎麼
// 實作出來的」這種開發者才需要知道的細節，混進了使用者會看到的標籤裡（甚至直接洩漏了 `roe/`
// 這種內部資料夾路徑）。這類實作細節要寫成程式碼註解（放在該欄位定義的上一行），name 只能放
// 使用者理解這個數字需要的資訊。之後新增/修改任何 `name` 欄位前，先問自己：這句話前端使用者
// 看得懂、也需要知道嗎？如果答案是「這是講給下一個維護程式碼的人聽的」，就不該出現在這裡。
//
// **`name` 永遠不能出現標點符號，也不能放 period 資訊**（2026-08-28）：
// - 不要有任何括號、逗號、頓號、斜線——多個詞要並列時用空白字元分隔（空白不算標點符號）。
//   人名/專有名詞本身固有的連字號（Z-Score、F-Score、M-Score）算拼寫的一部分，不算違規。
// - 不要出現「單季」「TTM」「單季年化」這類 period 描述——每個 field 已經有結構化的 `period`
//   欄位帶這個資訊，重複寫進 name 只是把同一份資料存兩份，前端要組合成「淨利率（TTM）」這種
//   顯示文字，應該自己拿 name + period 組裝，不是 name 自己就把格式化結果算好給前端。
//   這也代表同一個指標底下，單季/年化/TTM 三個 field 的 name 現在會是同一個字串，這是預期行為，
//   不是漏改——靠 key 分辨是哪個 field，靠 period 分辨是哪個口徑，name 只負責「這是什麼」。
// - 判斷標準延續 2026-08-28 稍早訂的「簡短但識別力強」原則：括號/文字如果是「別名」（EPS、
//   Graham Number 這類）或「回看窗口長度」這種 period 欄位本身不描述的維度（Beta 的 1 年/2 年/
//   5 年——period 描述的是取樣頻率 daily/weekly/monthly，窗口長度是另一個維度，兩者剛好對應
//   不代表可以互相取代，拿掉窗口長度前端會需要額外知道「weekly 就是指 2 年」這種隱性對應關係），
//   才留；如果是公式細節或數值範圍這種該讓
//   README/文件講的東西（例如 Altman X1~X5 的公式、F-Score 的 0~9 分範圍），就整段拿掉。

export type FilterFieldPeriod = 'quarterly' | 'quarterlyAnnualized' | 'ttm' | 'snapshot' | 'daily' | 'weekly' | 'monthly';

export interface FilterField {
  /** 對應該指標 API 回應 JSON 裡的欄位名稱 */
  key: string;
  /** 直接顯示給前端使用者看的文案——不放實作細節/內部路徑/標點符號/period 資訊，見檔案開頭說明 */
  name: string;
  period: FilterFieldPeriod;
}

export interface FilterMetric {
  /** 對應 src/domains/<category>/<key> 資料夾名稱；同一個底層 API 拆成多個顯示分組時
   *  （見下方 modelKey 說明），這裡仍然要是全 catalog 唯一的識別碼。 */
  key: string;
  /** 直接顯示給前端使用者看的文案——不放實作細節/內部路徑/標點符號/period 資訊，見檔案開頭說明 */
  name: string;
  /** GET route path */
  path: string;
  /** 這個顯示分組的欄位實際對應哪個 prisma/analysis/schema.prisma 的 model（用 model 名稱去掉
   *  Result 字尾、字首小寫的 metric key 表示）——只有「一個 API/model 拆成多個顯示分組」時才需要
   *  填，例如 turnoverRatio 底下 9 個分組都對應同一個 TurnoverRatioResult，modelKey 統一填
   *  'turnoverRatio'，但各自的 key 不一樣。不填時預設等於自己的 key（一般情況，一個 metric
   *  對應一個 model）。見 2026-08-30 filterCatalogCheck.ts 的說明。 */
  modelKey?: string;
  fields: FilterField[];
}

export interface FilterCategory {
  /** 對應 src/domains/<key> 資料夾名稱 */
  key: string;
  /** 直接顯示給前端使用者看的文案——不放實作細節/內部路徑/標點符號/period 資訊，見檔案開頭說明 */
  name: string;
  metrics: FilterMetric[];
}

export const filterCatalog: FilterCategory[] = [
  {
    key: 'profitability',
    name: '獲利能力',
    metrics: [
      {
        key: 'eps',
        name: '每股盈餘 EPS',
        path: '/profitability/eps',
        fields: [
          { key: 'epsQuarterly', name: 'EPS', period: 'quarterly' },
          { key: 'epsQuarterlyAnnualized', name: 'EPS', period: 'quarterlyAnnualized' },
          { key: 'epsTtm', name: 'EPS', period: 'ttm' },
        ],
      },
      {
        key: 'bvps',
        name: '每股淨值 BVPS',
        path: '/profitability/bvps',
        fields: [{ key: 'bvps', name: '每股淨值 BVPS', period: 'snapshot' }],
      },
      {
        key: 'revenuePerShare',
        name: '每股營收',
        path: '/profitability/revenue-per-share',
        fields: [
          { key: 'revenuePerShareQuarterly', name: '每股營收', period: 'quarterly' },
          { key: 'revenuePerShareQuarterlyAnnualized', name: '每股營收', period: 'quarterlyAnnualized' },
          { key: 'revenuePerShareTtm', name: '每股營收', period: 'ttm' },
        ],
      },
      {
        key: 'margins',
        name: '毛利率 營業利益率 稅後淨利率',
        path: '/profitability/margins',
        fields: [
          { key: 'grossMarginQuarterly', name: '毛利率', period: 'quarterly' },
          { key: 'grossMarginTtm', name: '毛利率', period: 'ttm' },
          { key: 'operatingMarginQuarterly', name: '營業利益率', period: 'quarterly' },
          { key: 'operatingMarginTtm', name: '營業利益率', period: 'ttm' },
          { key: 'netProfitMarginQuarterly', name: '稅後淨利率', period: 'quarterly' },
          { key: 'netProfitMarginTtm', name: '稅後淨利率', period: 'ttm' },
        ],
      },
      {
        key: 'roe',
        name: '股東權益報酬率 ROE',
        path: '/profitability/roe',
        fields: [
          { key: 'roeQuarterlyPct', name: 'ROE', period: 'quarterly' },
          { key: 'roeQuarterlyAnnualizedPct', name: 'ROE', period: 'quarterlyAnnualized' },
          { key: 'roeTtmPct', name: 'ROE', period: 'ttm' },
        ],
      },
      {
        key: 'roa',
        name: '總資產報酬率 ROA',
        path: '/profitability/roa',
        fields: [
          { key: 'roaQuarterlyPct', name: 'ROA', period: 'quarterly' },
          { key: 'roaQuarterlyAnnualizedPct', name: 'ROA', period: 'quarterlyAnnualized' },
          { key: 'roaTtmPct', name: 'ROA', period: 'ttm' },
        ],
      },
      {
        key: 'roic',
        name: '投入資本回報率 ROIC',
        path: '/profitability/roic',
        fields: [
          { key: 'roicQuarterlyPct', name: 'ROIC', period: 'quarterly' },
          { key: 'roicQuarterlyAnnualizedPct', name: 'ROIC', period: 'quarterlyAnnualized' },
          { key: 'roicTtmPct', name: 'ROIC', period: 'ttm' },
        ],
      },
      {
        key: 'roce',
        name: '使用資本報酬率 ROCE',
        path: '/profitability/roce',
        fields: [
          { key: 'roceQuarterlyPct', name: 'ROCE', period: 'quarterly' },
          { key: 'roceQuarterlyAnnualizedPct', name: 'ROCE', period: 'quarterlyAnnualized' },
          { key: 'roceTtmPct', name: 'ROCE', period: 'ttm' },
        ],
      },
      {
        key: 'dupont',
        name: '杜邦分析',
        path: '/profitability/dupont',
        fields: [
          { key: 'netProfitMarginQuarterly', name: '淨利率', period: 'quarterly' },
          { key: 'netProfitMarginTtm', name: '淨利率', period: 'ttm' },
          { key: 'assetTurnoverQuarterly', name: '總資產週轉率', period: 'quarterly' },
          { key: 'assetTurnoverTtm', name: '總資產週轉率', period: 'ttm' },
          { key: 'equityMultiplier', name: '權益乘數', period: 'snapshot' },
          { key: 'decomposedRoeQuarterlyPct', name: '組裝 ROE', period: 'quarterly' },
          { key: 'decomposedRoeTtmPct', name: '組裝 ROE', period: 'ttm' },
          // actualRoe* 是直接引用 roe/ 算出來的數字，用來對照 decomposedRoe* 拆解得準不準——
          // 這是內部實作細節，不要寫進 name（前端會直接顯示 name，不該出現 "roe/" 這種路徑）。
          { key: 'actualRoeQuarterlyPct', name: '實際 ROE', period: 'quarterly' },
          { key: 'actualRoeTtmPct', name: '實際 ROE', period: 'ttm' },
        ],
      },
      {
        key: 'dividendPayoutRatio',
        name: '配息率',
        path: '/profitability/dividend-payout-ratio',
        fields: [{ key: 'payoutRatioTtm', name: '配息率', period: 'ttm' }],
      },
      {
        key: 'sgr',
        name: '可持續成長率 SGR',
        path: '/profitability/sgr',
        fields: [{ key: 'sgrTtm', name: 'SGR', period: 'ttm' }],
      },
    ],
  },
  {
    key: 'cashFlow',
    name: '現金流量',
    metrics: [
      {
        key: 'cashFlowPerShare',
        name: '每股營業現金流 每股自由現金流',
        path: '/cash-flow/cash-flow-per-share',
        fields: [
          { key: 'ocfPerShareQuarterly', name: '每股營業現金流 OCF', period: 'quarterly' },
          { key: 'ocfPerShareQuarterlyAnnualized', name: '每股營業現金流 OCF', period: 'quarterlyAnnualized' },
          { key: 'ocfPerShareTtm', name: '每股營業現金流 OCF', period: 'ttm' },
          { key: 'fcfPerShareQuarterly', name: '每股自由現金流 FCF', period: 'quarterly' },
          { key: 'fcfPerShareQuarterlyAnnualized', name: '每股自由現金流 FCF', period: 'quarterlyAnnualized' },
          { key: 'fcfPerShareTtm', name: '每股自由現金流 FCF', period: 'ttm' },
        ],
      },
      {
        key: 'ocfToNetIncome',
        name: '營運現金流對淨利比',
        path: '/cash-flow/ocf-to-net-income',
        fields: [
          { key: 'ocfToNetIncomeQuarterly', name: '營運現金流對淨利比', period: 'quarterly' },
          { key: 'ocfToNetIncomeTtm', name: '營運現金流對淨利比', period: 'ttm' },
        ],
      },
      {
        key: 'accrualsRatio',
        name: '應計項目比率',
        path: '/cash-flow/accruals-ratio',
        fields: [
          { key: 'accrualsRatioQuarterly', name: '應計項目比率', period: 'quarterly' },
          { key: 'accrualsRatioQuarterlyAnnualized', name: '應計項目比率', period: 'quarterlyAnnualized' },
          { key: 'accrualsRatioTtm', name: '應計項目比率', period: 'ttm' },
        ],
      },
    ],
  },
  {
    key: 'solvency',
    name: '償債能力',
    metrics: [
      {
        key: 'liquidityRatio',
        name: '流動比率 速動比率 現金比率',
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
          { key: 'interestCoverageQuarterly', name: '利息保障倍數', period: 'quarterly' },
          { key: 'interestCoverageTtm', name: '利息保障倍數', period: 'ttm' },
        ],
      },
      {
        key: 'netDebtToEbitda',
        name: '淨負債對 EBITDA 比',
        path: '/solvency/net-debt-to-ebitda',
        fields: [
          { key: 'netDebtToEbitdaQuarterlyAnnualized', name: '淨負債對 EBITDA 比', period: 'quarterlyAnnualized' },
          { key: 'netDebtToEbitdaTtm', name: '淨負債對 EBITDA 比', period: 'ttm' },
        ],
      },
    ],
  },
  {
    key: 'turnover',
    name: '營運週轉',
    metrics: [
      // 底下 9 個顯示分組都來自同一支 API（GET /turnover/turnover-ratio）、同一個 model
      // （TurnoverRatioResult），modelKey 統一填 'turnoverRatio'——2026-08-30 從一個合併 metric
      // （name 是 4 種周轉率硬湊在一起的長字串）拆開，讓使用者在 /filters 清單裡能個別看到
      // 存貨/應收帳款/總資產/固定資產/應付帳款周轉率，以及 DIO/DSO/DPO/CCC 這 4 個週轉天數/週期
      // 指標，不用面對一個塞了 22 個欄位、名稱看不出全貌的巨大分組。
      {
        key: 'inventoryTurnoverRatio',
        name: '存貨周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'inventoryTurnoverQuarterly', name: '存貨周轉率', period: 'quarterly' },
          { key: 'inventoryTurnoverQuarterlyAnnualized', name: '存貨周轉率', period: 'quarterlyAnnualized' },
          { key: 'inventoryTurnoverTtm', name: '存貨周轉率', period: 'ttm' },
        ],
      },
      {
        key: 'receivablesTurnoverRatio',
        name: '應收帳款周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'receivablesTurnoverQuarterly', name: '應收帳款周轉率', period: 'quarterly' },
          { key: 'receivablesTurnoverQuarterlyAnnualized', name: '應收帳款周轉率', period: 'quarterlyAnnualized' },
          { key: 'receivablesTurnoverTtm', name: '應收帳款周轉率', period: 'ttm' },
        ],
      },
      {
        key: 'assetTurnoverRatio',
        name: '總資產周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'assetTurnoverQuarterly', name: '總資產周轉率', period: 'quarterly' },
          { key: 'assetTurnoverQuarterlyAnnualized', name: '總資產周轉率', period: 'quarterlyAnnualized' },
          { key: 'assetTurnoverTtm', name: '總資產周轉率', period: 'ttm' },
        ],
      },
      {
        key: 'fixedAssetTurnoverRatio',
        name: '固定資產周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'fixedAssetTurnoverQuarterly', name: '固定資產周轉率', period: 'quarterly' },
          { key: 'fixedAssetTurnoverQuarterlyAnnualized', name: '固定資產周轉率', period: 'quarterlyAnnualized' },
          { key: 'fixedAssetTurnoverTtm', name: '固定資產周轉率', period: 'ttm' },
        ],
      },
      {
        key: 'payablesTurnoverRatio',
        name: '應付帳款周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'payablesTurnoverQuarterly', name: '應付帳款周轉率', period: 'quarterly' },
          { key: 'payablesTurnoverQuarterlyAnnualized', name: '應付帳款周轉率', period: 'quarterlyAnnualized' },
          { key: 'payablesTurnoverTtm', name: '應付帳款周轉率', period: 'ttm' },
        ],
      },
      {
        key: 'inventoryDays',
        name: 'DIO 存貨週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'inventoryDaysQuarterlyAnnualized', name: 'DIO 存貨週轉天數', period: 'quarterlyAnnualized' },
          { key: 'inventoryDaysTtm', name: 'DIO 存貨週轉天數', period: 'ttm' },
        ],
      },
      {
        key: 'receivablesDays',
        name: 'DSO 應收帳款週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'receivablesDaysQuarterlyAnnualized', name: 'DSO 應收帳款週轉天數', period: 'quarterlyAnnualized' },
          { key: 'receivablesDaysTtm', name: 'DSO 應收帳款週轉天數', period: 'ttm' },
        ],
      },
      {
        key: 'payablesDays',
        name: 'DPO 應付帳款週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'payablesDaysQuarterlyAnnualized', name: 'DPO 應付帳款週轉天數', period: 'quarterlyAnnualized' },
          { key: 'payablesDaysTtm', name: 'DPO 應付帳款週轉天數', period: 'ttm' },
        ],
      },
      {
        key: 'cashConversionCycle',
        name: 'CCC 現金轉換週期',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'cashConversionCycleQuarterlyAnnualized', name: 'CCC 現金轉換週期', period: 'quarterlyAnnualized' },
          { key: 'cashConversionCycleTtm', name: 'CCC 現金轉換週期', period: 'ttm' },
        ],
      },
      {
        key: 'capexToRevenue',
        name: '資本支出佔營收比',
        path: '/turnover/capex-to-revenue',
        fields: [
          { key: 'capexToRevenueQuarterly', name: '資本支出佔營收比', period: 'quarterly' },
          { key: 'capexToRevenueTtm', name: '資本支出佔營收比', period: 'ttm' },
        ],
      },
    ],
  },
  {
    key: 'valuation',
    name: '估值指標',
    metrics: [
      {
        key: 'marketRatios',
        name: '本益比 股價淨值比 股息殖利率',
        path: '/valuation/market-ratios',
        fields: [
          { key: 'peRatio', name: '本益比 PER', period: 'daily' },
          { key: 'pbRatio', name: '股價淨值比 PBR', period: 'daily' },
          { key: 'dividendYieldPct', name: '股息殖利率', period: 'daily' },
        ],
      },
    ],
  },
  {
    key: 'guru',
    name: '大師指標',
    metrics: [
      {
        key: 'grahamNumber',
        name: '葛拉漢數 Graham Number',
        path: '/guru/graham-number',
        fields: [{ key: 'grahamNumber', name: '葛拉漢數', period: 'ttm' }],
      },
      {
        key: 'ncav',
        name: '葛拉漢淨流動資產價值 Graham NCAV',
        path: '/guru/ncav',
        fields: [
          { key: 'ncav', name: 'NCAV 淨流動資產價值', period: 'snapshot' },
          { key: 'marginOfSafetyPrice', name: '安全邊際價', period: 'snapshot' },
        ],
      },
      {
        key: 'ownerEarnings',
        name: '每股股東盈餘 Buffett Owner Earnings',
        path: '/guru/owner-earnings',
        fields: [
          { key: 'ownerEarningsPerShareQuarterly', name: '每股股東盈餘', period: 'quarterly' },
          { key: 'ownerEarningsPerShareQuarterlyAnnualized', name: '每股股東盈餘', period: 'quarterlyAnnualized' },
          { key: 'ownerEarningsPerShareTtm', name: '每股股東盈餘', period: 'ttm' },
        ],
      },
      {
        key: 'altmanZScore',
        name: '奧特曼 Z 分數 Altman Z-Score 原始版',
        path: '/guru/altman-z-score',
        fields: [
          { key: 'zScore', name: 'Z 分數', period: 'snapshot' },
          // X1~X5 各自的公式見 src/domains/guru/README.md「Altman_Z_Score 計算口徑」，
          // 公式細節屬於文件該講的事，不放進 name（name 只負責識別是哪一個變數）。
          { key: 'x1', name: 'X1', period: 'snapshot' },
          { key: 'x2', name: 'X2', period: 'snapshot' },
          { key: 'x3', name: 'X3', period: 'ttm' },
          { key: 'x4', name: 'X4', period: 'daily' },
          { key: 'x5', name: 'X5', period: 'ttm' },
        ],
      },
      {
        key: 'piotroskiFScore',
        name: '皮爾托斯基 F 分數 Piotroski F-Score',
        path: '/guru/piotroski-f-score',
        // 分數範圍 0~9 屬於文件該講的事，不放進 name。
        fields: [{ key: 'score', name: 'F 分數', period: 'snapshot' }],
      },
      {
        key: 'beneishMScore',
        name: '貝尼許 M 分數 Beneish M-Score',
        path: '/guru/beneish-m-score',
        fields: [
          { key: 'mScore', name: 'M 分數', period: 'snapshot' },
          { key: 'dsri', name: 'DSRI 應收帳款指數', period: 'snapshot' },
          { key: 'gmi', name: 'GMI 毛利率指數', period: 'snapshot' },
          { key: 'aqi', name: 'AQI 資產品質指數', period: 'snapshot' },
          { key: 'sgi', name: 'SGI 營收成長指數', period: 'snapshot' },
          { key: 'depi', name: 'DEPI 折舊指數', period: 'snapshot' },
          { key: 'sgai', name: 'SGAI 管銷費用指數', period: 'snapshot' },
          { key: 'tata', name: 'TATA 總應計利潤對總資產比', period: 'snapshot' },
          { key: 'lvgi', name: 'LVGI 槓桿指數', period: 'snapshot' },
        ],
      },
      {
        key: 'nissimPenmanRnoa',
        name: 'Nissim Penman RNOA 拆解',
        path: '/guru/nissim-penman-rnoa',
        fields: [
          { key: 'rnoaQuarterlyPct', name: 'RNOA 本業報酬率', period: 'quarterly' },
          { key: 'rnoaQuarterlyAnnualizedPct', name: 'RNOA 本業報酬率', period: 'quarterlyAnnualized' },
          { key: 'rnoaTtmPct', name: 'RNOA 本業報酬率', period: 'ttm' },
          { key: 'flev', name: 'FLEV 財務槓桿', period: 'snapshot' },
          { key: 'nbcQuarterlyPct', name: 'NBC 淨借貸利率', period: 'quarterly' },
          { key: 'nbcTtmPct', name: 'NBC 淨借貸利率', period: 'ttm' },
          { key: 'spreadQuarterlyPct', name: 'SPREAD', period: 'quarterly' },
          { key: 'spreadTtmPct', name: 'SPREAD', period: 'ttm' },
          { key: 'reconstructedRoeQuarterlyPct', name: '組裝 ROE', period: 'quarterly' },
          { key: 'reconstructedRoeTtmPct', name: '組裝 ROE', period: 'ttm' },
          // actualRoe* 是直接引用 roe/ 算出來的數字，用來對照 reconstructedRoe* 拆解得準不準——
          // 這是內部實作細節，不要寫進 name（前端會直接顯示 name，不該出現 "roe/" 這種路徑）。
          { key: 'actualRoeQuarterlyPct', name: '實際 ROE', period: 'quarterly' },
          { key: 'actualRoeTtmPct', name: '實際 ROE', period: 'ttm' },
        ],
      },
      {
        key: 'zmijewskiScore',
        name: 'Zmijewski Score',
        path: '/guru/zmijewski-score',
        // 門檻/機率範圍屬於文件該講的事，不放進 name。
        fields: [
          { key: 'xScore', name: 'X 分數', period: 'snapshot' },
          { key: 'probabilityOfDistress', name: '財務危機機率', period: 'snapshot' },
        ],
      },
      {
        key: 'ohlsonOScore',
        name: 'Ohlson O-Score',
        path: '/guru/ohlson-o-score',
        // 九個子變數（SIZE/TLTA/WCTA/CLCA/OENEG/NITA/FUTL/INTWO/CHIN）的公式見
        // src/domains/guru/README.md，公式細節屬於文件該講的事，不放進 name。
        fields: [
          { key: 'oScore', name: 'O 分數', period: 'snapshot' },
          { key: 'probabilityOfBankruptcy', name: '財務危機機率', period: 'snapshot' },
          { key: 'size', name: 'SIZE', period: 'snapshot' },
          { key: 'tlta', name: 'TLTA', period: 'snapshot' },
          { key: 'wcta', name: 'WCTA', period: 'snapshot' },
          { key: 'clca', name: 'CLCA', period: 'snapshot' },
          { key: 'oeneg', name: 'OENEG', period: 'snapshot' },
          { key: 'nita', name: 'NITA', period: 'ttm' },
          { key: 'futl', name: 'FUTL', period: 'ttm' },
          { key: 'intwo', name: 'INTWO', period: 'snapshot' },
          { key: 'chin', name: 'CHIN', period: 'snapshot' },
        ],
      },
    ],
  },
  {
    key: 'portfolio',
    name: '投資組合',
    metrics: [
      {
        key: 'beta',
        name: '貝塔係數 Beta',
        path: '/portfolio/beta',
        fields: [
          // period 描述取樣頻率（1Y 用日資料、2Y 用週資料對齊 Bloomberg、5Y 用月資料對齊
          // Yahoo Finance，見 portfolio/beta/service.ts），不是回看窗口長度——兩者剛好一一對應
          // 不代表窗口長度可以從 period 反推，1 年/2 年/5 年是獨立的識別資訊，留在 name 裡。
          { key: 'beta1Y', name: 'Beta 1 年', period: 'daily' },
          { key: 'beta2Y', name: 'Beta 2 年', period: 'weekly' },
          { key: 'beta5Y', name: 'Beta 5 年', period: 'monthly' },
        ],
      },
    ],
  },
];
