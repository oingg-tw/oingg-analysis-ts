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
//
// **人名/字母代號翻中文，沒有獨立會計意義就不要放（2026-08-30）**：判斷標準是「這段中文除了
// 告訴讀者『這是某個人發明的』或『這個字母是某人選的』以外，有沒有自己的意思」——
// - 「奧特曼」「皮爾托斯基」「貝尼許」「葛拉漢」這種人名音譯本身沒有會計意義，只用英文
//   （Altman Z-Score、Piotroski F-Score、Beneish M-Score、Graham Number）。
// - 「F 分數」「M 分數」「Z 分數」這類也一併拿掉——F/M/Z 只是發明者當初隨意選的字母，翻成中文
//   不會多出任何意義，跟人名音譯是同一種情況，不是「有會計意義的中文詞」。
// - 反過來，「淨流動資產價值」（NCAV）、「每股股東盈餘」（Owner Earnings）、「貝塔係數」（Beta）
//   這種是真正的會計/財務概念中文翻譯，即使概念是某人提出的，翻譯本身有獨立意義，要保留
//   （「貝塔」雖然也是希臘字母音譯，但「貝塔係數」是中文財務文獻通用的固定詞彙，不是「某人的姓氏」
//   這種要靠額外背景知識才看得懂的音譯，跟 F/M/Z 分數的情況不同）。

export type FilterFieldPeriod = 'quarterly' | 'quarterlyAnnualized' | 'ttm' | 'snapshot' | 'daily' | 'weekly' | 'monthly';

export interface FilterField {
  /** 對應該指標 API 回應 JSON 裡的欄位名稱 */
  key: string;
  /** 直接顯示給前端使用者看的文案——不放實作細節/內部路徑/標點符號/period 資訊，見檔案開頭說明 */
  name: string;
  period: FilterFieldPeriod;
  /** 給前端排序用，只在同一個 metric 的 fields 陣列內有意義（從 1 開始），不是全 catalog 唯一。 */
  sort: number;
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
          { key: 'epsQuarterly', name: 'EPS', period: 'quarterly', sort: 1 },
          { key: 'epsQuarterlyAnnualized', name: 'EPS', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'epsTtm', name: 'EPS', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'bvps',
        name: '每股淨值 BVPS',
        path: '/profitability/bvps',
        fields: [{ key: 'bvps', name: '每股淨值 BVPS', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'revenuePerShare',
        name: '每股營收',
        path: '/profitability/revenue-per-share',
        fields: [
          { key: 'revenuePerShareQuarterly', name: '每股營收', period: 'quarterly', sort: 1 },
          { key: 'revenuePerShareQuarterlyAnnualized', name: '每股營收', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'revenuePerShareTtm', name: '每股營收', period: 'ttm', sort: 3 },
        ],
      },
      // 底下 3 個顯示分組都來自同一支 API（GET /profitability/margins）、同一個 model
      // （MarginsResult），modelKey 統一填 'margins'——2026-08-30 從一個合併 metric（name 是
      // 3 種利潤率硬湊在一起的長字串）拆開，讓使用者在 /filters 清單裡能個別看到毛利率、
      // 營業利益率、稅後淨利率，跟 turnoverRatio 那次拆分同一種理由。
      {
        key: 'grossMargin',
        name: '毛利率',
        path: '/profitability/margins',
        modelKey: 'margins',
        fields: [
          { key: 'grossMarginQuarterly', name: '毛利率', period: 'quarterly', sort: 1 },
          { key: 'grossMarginTtm', name: '毛利率', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'operatingMargin',
        name: '營業利益率',
        path: '/profitability/margins',
        modelKey: 'margins',
        fields: [
          { key: 'operatingMarginQuarterly', name: '營業利益率', period: 'quarterly', sort: 1 },
          { key: 'operatingMarginTtm', name: '營業利益率', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'netProfitMargin',
        name: '稅後淨利率',
        path: '/profitability/margins',
        modelKey: 'margins',
        fields: [
          { key: 'netProfitMarginQuarterly', name: '稅後淨利率', period: 'quarterly', sort: 1 },
          { key: 'netProfitMarginTtm', name: '稅後淨利率', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'roe',
        name: '股東權益報酬率 ROE',
        path: '/profitability/roe',
        fields: [
          { key: 'roeQuarterlyPct', name: 'ROE', period: 'quarterly', sort: 1 },
          { key: 'roeQuarterlyAnnualizedPct', name: 'ROE', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'roeTtmPct', name: 'ROE', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'roa',
        name: '總資產報酬率 ROA',
        path: '/profitability/roa',
        fields: [
          { key: 'roaQuarterlyPct', name: 'ROA', period: 'quarterly', sort: 1 },
          { key: 'roaQuarterlyAnnualizedPct', name: 'ROA', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'roaTtmPct', name: 'ROA', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'roic',
        name: '投入資本回報率 ROIC',
        path: '/profitability/roic',
        fields: [
          { key: 'roicQuarterlyPct', name: 'ROIC', period: 'quarterly', sort: 1 },
          { key: 'roicQuarterlyAnnualizedPct', name: 'ROIC', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'roicTtmPct', name: 'ROIC', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'roce',
        name: '使用資本報酬率 ROCE',
        path: '/profitability/roce',
        fields: [
          { key: 'roceQuarterlyPct', name: 'ROCE', period: 'quarterly', sort: 1 },
          { key: 'roceQuarterlyAnnualizedPct', name: 'ROCE', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'roceTtmPct', name: 'ROCE', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'dupont',
        name: '杜邦分析',
        path: '/profitability/dupont',
        fields: [
          { key: 'netProfitMarginQuarterly', name: '淨利率', period: 'quarterly', sort: 1 },
          { key: 'netProfitMarginTtm', name: '淨利率', period: 'ttm', sort: 2 },
          { key: 'assetTurnoverQuarterly', name: '總資產週轉率', period: 'quarterly', sort: 3 },
          { key: 'assetTurnoverTtm', name: '總資產週轉率', period: 'ttm', sort: 4 },
          { key: 'equityMultiplier', name: '權益乘數', period: 'snapshot', sort: 5 },
          { key: 'decomposedRoeQuarterlyPct', name: '組裝 ROE', period: 'quarterly', sort: 6 },
          { key: 'decomposedRoeTtmPct', name: '組裝 ROE', period: 'ttm', sort: 7 },
          // actualRoe* 是直接引用 roe/ 算出來的數字，用來對照 decomposedRoe* 拆解得準不準——
          // 這是內部實作細節，不要寫進 name（前端會直接顯示 name，不該出現 "roe/" 這種路徑）。
          { key: 'actualRoeQuarterlyPct', name: '實際 ROE', period: 'quarterly', sort: 8 },
          { key: 'actualRoeTtmPct', name: '實際 ROE', period: 'ttm', sort: 9 },
        ],
      },
      {
        key: 'dividendPayoutRatio',
        name: '配息率',
        path: '/profitability/dividend-payout-ratio',
        fields: [{ key: 'payoutRatioTtm', name: '配息率', period: 'ttm', sort: 1 }],
      },
      {
        key: 'sgr',
        name: '可持續成長率 SGR',
        path: '/profitability/sgr',
        fields: [{ key: 'sgrTtm', name: 'SGR', period: 'ttm', sort: 1 }],
      },
    ],
  },
  {
    key: 'cashFlow',
    name: '現金流量',
    metrics: [
      // 底下 2 個顯示分組都來自同一支 API（GET /cash-flow/cash-flow-per-share）、同一個 model
      // （CashFlowPerShareResult），modelKey 統一填 'cashFlowPerShare'——跟 margins/marketRatios
      // 同一種理由：OCF、FCF 是兩個獨立有意義的指標，不該擠在同一個 name 裡。
      {
        key: 'ocfPerShare',
        name: '每股營業現金流 OCF',
        path: '/cash-flow/cash-flow-per-share',
        modelKey: 'cashFlowPerShare',
        fields: [
          { key: 'ocfPerShareQuarterly', name: '每股營業現金流 OCF', period: 'quarterly', sort: 1 },
          { key: 'ocfPerShareQuarterlyAnnualized', name: '每股營業現金流 OCF', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'ocfPerShareTtm', name: '每股營業現金流 OCF', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'fcfPerShare',
        name: '每股自由現金流 FCF',
        path: '/cash-flow/cash-flow-per-share',
        modelKey: 'cashFlowPerShare',
        fields: [
          { key: 'fcfPerShareQuarterly', name: '每股自由現金流 FCF', period: 'quarterly', sort: 1 },
          { key: 'fcfPerShareQuarterlyAnnualized', name: '每股自由現金流 FCF', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'fcfPerShareTtm', name: '每股自由現金流 FCF', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'ocfToNetIncome',
        name: '營運現金流對淨利比',
        path: '/cash-flow/ocf-to-net-income',
        fields: [
          { key: 'ocfToNetIncomeQuarterly', name: '營運現金流對淨利比', period: 'quarterly', sort: 1 },
          { key: 'ocfToNetIncomeTtm', name: '營運現金流對淨利比', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'accrualsRatio',
        name: '應計項目比率',
        path: '/cash-flow/accruals-ratio',
        fields: [
          { key: 'accrualsRatioQuarterly', name: '應計項目比率', period: 'quarterly', sort: 1 },
          { key: 'accrualsRatioQuarterlyAnnualized', name: '應計項目比率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'accrualsRatioTtm', name: '應計項目比率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'fcfYield',
        name: '自由現金流殖利率',
        path: '/cash-flow/fcf-yield',
        fields: [
          { key: 'fcfYieldQuarterlyAnnualizedPct', name: '自由現金流殖利率', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'fcfYieldTtmPct', name: '自由現金流殖利率', period: 'ttm', sort: 2 },
        ],
      },
    ],
  },
  {
    key: 'solvency',
    name: '償債能力',
    metrics: [
      // 底下 3 個顯示分組都來自同一支 API（GET /solvency/liquidity-ratio）、同一個 model
      // （LiquidityRatioResult），modelKey 統一填 'liquidityRatio'——同一種理由，三個是各自
      // 獨立有意義的比率，不該擠在同一個 name 裡。
      {
        key: 'currentRatio',
        name: '流動比率',
        path: '/solvency/liquidity-ratio',
        modelKey: 'liquidityRatio',
        fields: [{ key: 'currentRatioPct', name: '流動比率', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'quickRatio',
        name: '速動比率',
        path: '/solvency/liquidity-ratio',
        modelKey: 'liquidityRatio',
        fields: [{ key: 'quickRatioPct', name: '速動比率', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'cashRatio',
        name: '現金比率',
        path: '/solvency/liquidity-ratio',
        modelKey: 'liquidityRatio',
        fields: [{ key: 'cashRatioPct', name: '現金比率', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'debtRatio',
        name: '資產負債率',
        path: '/solvency/debt-ratio',
        fields: [{ key: 'debtRatioPct', name: '資產負債率', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'deRatio',
        name: '負債權益比',
        path: '/solvency/de-ratio',
        fields: [{ key: 'deRatioPct', name: '負債權益比', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'interestCoverage',
        name: '利息保障倍數',
        path: '/solvency/interest-coverage',
        fields: [
          { key: 'interestCoverageQuarterly', name: '利息保障倍數', period: 'quarterly', sort: 1 },
          { key: 'interestCoverageTtm', name: '利息保障倍數', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'netDebtToEbitda',
        name: '淨負債對 EBITDA 比',
        path: '/solvency/net-debt-to-ebitda',
        fields: [
          { key: 'netDebtToEbitdaQuarterlyAnnualized', name: '淨負債對 EBITDA 比', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'netDebtToEbitdaTtm', name: '淨負債對 EBITDA 比', period: 'ttm', sort: 2 },
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
          { key: 'inventoryTurnoverQuarterly', name: '存貨周轉率', period: 'quarterly', sort: 1 },
          { key: 'inventoryTurnoverQuarterlyAnnualized', name: '存貨周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'inventoryTurnoverTtm', name: '存貨周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'receivablesTurnoverRatio',
        name: '應收帳款周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'receivablesTurnoverQuarterly', name: '應收帳款周轉率', period: 'quarterly', sort: 1 },
          { key: 'receivablesTurnoverQuarterlyAnnualized', name: '應收帳款周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'receivablesTurnoverTtm', name: '應收帳款周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'assetTurnoverRatio',
        name: '總資產周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'assetTurnoverQuarterly', name: '總資產周轉率', period: 'quarterly', sort: 1 },
          { key: 'assetTurnoverQuarterlyAnnualized', name: '總資產周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'assetTurnoverTtm', name: '總資產周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'fixedAssetTurnoverRatio',
        name: '固定資產周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'fixedAssetTurnoverQuarterly', name: '固定資產周轉率', period: 'quarterly', sort: 1 },
          { key: 'fixedAssetTurnoverQuarterlyAnnualized', name: '固定資產周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'fixedAssetTurnoverTtm', name: '固定資產周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'payablesTurnoverRatio',
        name: '應付帳款周轉率',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'payablesTurnoverQuarterly', name: '應付帳款周轉率', period: 'quarterly', sort: 1 },
          { key: 'payablesTurnoverQuarterlyAnnualized', name: '應付帳款周轉率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'payablesTurnoverTtm', name: '應付帳款周轉率', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'inventoryDays',
        name: 'DIO 存貨週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'inventoryDaysQuarterlyAnnualized', name: 'DIO 存貨週轉天數', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'inventoryDaysTtm', name: 'DIO 存貨週轉天數', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'receivablesDays',
        name: 'DSO 應收帳款週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'receivablesDaysQuarterlyAnnualized', name: 'DSO 應收帳款週轉天數', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'receivablesDaysTtm', name: 'DSO 應收帳款週轉天數', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'payablesDays',
        name: 'DPO 應付帳款週轉天數',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'payablesDaysQuarterlyAnnualized', name: 'DPO 應付帳款週轉天數', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'payablesDaysTtm', name: 'DPO 應付帳款週轉天數', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'cashConversionCycle',
        name: 'CCC 現金轉換週期',
        path: '/turnover/turnover-ratio',
        modelKey: 'turnoverRatio',
        fields: [
          { key: 'cashConversionCycleQuarterlyAnnualized', name: 'CCC 現金轉換週期', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'cashConversionCycleTtm', name: 'CCC 現金轉換週期', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'capexToRevenue',
        name: '資本支出佔營收比',
        path: '/turnover/capex-to-revenue',
        fields: [
          { key: 'capexToRevenueQuarterly', name: '資本支出佔營收比', period: 'quarterly', sort: 1 },
          { key: 'capexToRevenueTtm', name: '資本支出佔營收比', period: 'ttm', sort: 2 },
        ],
      },
    ],
  },
  {
    key: 'valuation',
    name: '估值指標',
    metrics: [
      // 底下 3 個顯示分組都來自同一支 API（GET /valuation/market-ratios）、同一個 model
      // （MarketRatiosResult），modelKey 統一填 'marketRatios'——2026-08-30 從一個合併 metric
      // （name 是 3 個估值比率硬湊在一起的長字串）拆開，跟 margins/turnoverRatio 同一種理由。
      {
        key: 'per',
        name: '本益比 PER',
        path: '/valuation/market-ratios',
        modelKey: 'marketRatios',
        fields: [{ key: 'peRatio', name: '本益比 PER', period: 'daily', sort: 1 }],
      },
      {
        key: 'pbr',
        name: '股價淨值比 PBR',
        path: '/valuation/market-ratios',
        modelKey: 'marketRatios',
        fields: [{ key: 'pbRatio', name: '股價淨值比 PBR', period: 'daily', sort: 1 }],
      },
      {
        key: 'dividendYield',
        name: '股息殖利率',
        path: '/valuation/market-ratios',
        modelKey: 'marketRatios',
        fields: [{ key: 'dividendYieldPct', name: '股息殖利率', period: 'daily', sort: 1 }],
      },
      {
        key: 'psr',
        name: '股價營收比 PSR',
        path: '/valuation/psr',
        fields: [
          { key: 'psrQuarterlyAnnualized', name: '股價營收比 PSR', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'psrTtm', name: '股價營收比 PSR', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'pFcf',
        name: '股價自由現金流比',
        path: '/valuation/p-fcf',
        fields: [
          { key: 'pFcfQuarterlyAnnualized', name: '股價自由現金流比', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'pFcfTtm', name: '股價自由現金流比', period: 'ttm', sort: 2 },
        ],
      },
      {
        key: 'evEbitda',
        name: '企業價值倍數',
        path: '/valuation/ev-ebitda',
        fields: [
          { key: 'evToEbitdaQuarterlyAnnualized', name: '企業價值倍數', period: 'quarterlyAnnualized', sort: 1 },
          { key: 'evToEbitdaTtm', name: '企業價值倍數', period: 'ttm', sort: 2 },
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
        name: 'Graham Number',
        path: '/guru/graham-number',
        fields: [{ key: 'grahamNumber', name: 'Graham Number', period: 'ttm', sort: 1 }],
      },
      {
        key: 'ncav',
        name: '淨流動資產價值 NCAV',
        path: '/guru/ncav',
        fields: [
          { key: 'ncav', name: 'NCAV 淨流動資產價值', period: 'snapshot', sort: 1 },
          { key: 'marginOfSafetyPrice', name: '安全邊際價', period: 'snapshot', sort: 2 },
        ],
      },
      {
        key: 'ownerEarnings',
        name: '每股股東盈餘 Owner Earnings',
        path: '/guru/owner-earnings',
        fields: [
          { key: 'ownerEarningsPerShareQuarterly', name: '每股股東盈餘', period: 'quarterly', sort: 1 },
          { key: 'ownerEarningsPerShareQuarterlyAnnualized', name: '每股股東盈餘', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'ownerEarningsPerShareTtm', name: '每股股東盈餘', period: 'ttm', sort: 3 },
        ],
      },
      {
        key: 'altmanZScore',
        name: 'Altman Z-Score 原始版',
        path: '/guru/altman-z-score',
        fields: [
          { key: 'zScore', name: 'Z 分數', period: 'snapshot', sort: 1 },
          // X1~X5 各自的公式見 src/domains/guru/README.md「Altman_Z_Score 計算口徑」，
          // 公式細節屬於文件該講的事，不放進 name（name 只負責識別是哪一個變數）。
          { key: 'x1', name: 'X1', period: 'snapshot', sort: 2 },
          { key: 'x2', name: 'X2', period: 'snapshot', sort: 3 },
          { key: 'x3', name: 'X3', period: 'ttm', sort: 4 },
          { key: 'x4', name: 'X4', period: 'daily', sort: 5 },
          { key: 'x5', name: 'X5', period: 'ttm', sort: 6 },
        ],
      },
      {
        key: 'piotroskiFScore',
        name: 'Piotroski F-Score',
        path: '/guru/piotroski-f-score',
        // 分數範圍 0~9 屬於文件該講的事，不放進 name。
        fields: [{ key: 'score', name: 'F 分數', period: 'snapshot', sort: 1 }],
      },
      {
        key: 'beneishMScore',
        name: 'Beneish M-Score',
        path: '/guru/beneish-m-score',
        fields: [
          { key: 'mScore', name: 'M 分數', period: 'snapshot', sort: 1 },
          { key: 'dsri', name: 'DSRI 應收帳款指數', period: 'snapshot', sort: 2 },
          { key: 'gmi', name: 'GMI 毛利率指數', period: 'snapshot', sort: 3 },
          { key: 'aqi', name: 'AQI 資產品質指數', period: 'snapshot', sort: 4 },
          { key: 'sgi', name: 'SGI 營收成長指數', period: 'snapshot', sort: 5 },
          { key: 'depi', name: 'DEPI 折舊指數', period: 'snapshot', sort: 6 },
          { key: 'sgai', name: 'SGAI 管銷費用指數', period: 'snapshot', sort: 7 },
          { key: 'tata', name: 'TATA 總應計利潤對總資產比', period: 'snapshot', sort: 8 },
          { key: 'lvgi', name: 'LVGI 槓桿指數', period: 'snapshot', sort: 9 },
        ],
      },
      {
        key: 'nissimPenmanRnoa',
        name: 'Nissim Penman RNOA',
        path: '/guru/nissim-penman-rnoa',
        fields: [
          { key: 'rnoaQuarterlyPct', name: 'RNOA 本業報酬率', period: 'quarterly', sort: 1 },
          { key: 'rnoaQuarterlyAnnualizedPct', name: 'RNOA 本業報酬率', period: 'quarterlyAnnualized', sort: 2 },
          { key: 'rnoaTtmPct', name: 'RNOA 本業報酬率', period: 'ttm', sort: 3 },
          { key: 'flev', name: 'FLEV 財務槓桿', period: 'snapshot', sort: 4 },
          { key: 'nbcQuarterlyPct', name: 'NBC 淨借貸利率', period: 'quarterly', sort: 5 },
          { key: 'nbcTtmPct', name: 'NBC 淨借貸利率', period: 'ttm', sort: 6 },
          { key: 'spreadQuarterlyPct', name: 'SPREAD', period: 'quarterly', sort: 7 },
          { key: 'spreadTtmPct', name: 'SPREAD', period: 'ttm', sort: 8 },
          { key: 'reconstructedRoeQuarterlyPct', name: '組裝 ROE', period: 'quarterly', sort: 9 },
          { key: 'reconstructedRoeTtmPct', name: '組裝 ROE', period: 'ttm', sort: 10 },
          // actualRoe* 是直接引用 roe/ 算出來的數字，用來對照 reconstructedRoe* 拆解得準不準——
          // 這是內部實作細節，不要寫進 name（前端會直接顯示 name，不該出現 "roe/" 這種路徑）。
          { key: 'actualRoeQuarterlyPct', name: '實際 ROE', period: 'quarterly', sort: 11 },
          { key: 'actualRoeTtmPct', name: '實際 ROE', period: 'ttm', sort: 12 },
        ],
      },
      {
        key: 'zmijewskiScore',
        name: 'Zmijewski Score',
        path: '/guru/zmijewski-score',
        // 門檻/機率範圍屬於文件該講的事，不放進 name。
        fields: [
          { key: 'xScore', name: 'X 分數', period: 'snapshot', sort: 1 },
          { key: 'probabilityOfDistress', name: '財務危機機率', period: 'snapshot', sort: 2 },
        ],
      },
      {
        key: 'ohlsonOScore',
        name: 'Ohlson O-Score',
        path: '/guru/ohlson-o-score',
        // 九個子變數（SIZE/TLTA/WCTA/CLCA/OENEG/NITA/FUTL/INTWO/CHIN）的公式見
        // src/domains/guru/README.md，公式細節屬於文件該講的事，不放進 name。
        fields: [
          { key: 'oScore', name: 'O 分數', period: 'snapshot', sort: 1 },
          { key: 'probabilityOfBankruptcy', name: '財務危機機率', period: 'snapshot', sort: 2 },
          { key: 'size', name: 'SIZE', period: 'snapshot', sort: 3 },
          { key: 'tlta', name: 'TLTA', period: 'snapshot', sort: 4 },
          { key: 'wcta', name: 'WCTA', period: 'snapshot', sort: 5 },
          { key: 'clca', name: 'CLCA', period: 'snapshot', sort: 6 },
          { key: 'oeneg', name: 'OENEG', period: 'snapshot', sort: 7 },
          { key: 'nita', name: 'NITA', period: 'ttm', sort: 8 },
          { key: 'futl', name: 'FUTL', period: 'ttm', sort: 9 },
          { key: 'intwo', name: 'INTWO', period: 'snapshot', sort: 10 },
          { key: 'chin', name: 'CHIN', period: 'snapshot', sort: 11 },
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
          { key: 'beta1Y', name: 'Beta 1 年', period: 'daily', sort: 1 },
          { key: 'beta2Y', name: 'Beta 2 年', period: 'weekly', sort: 2 },
          { key: 'beta5Y', name: 'Beta 5 年', period: 'monthly', sort: 3 },
        ],
      },
    ],
  },
  {
    key: 'technicals',
    name: '技術指標',
    metrics: [
      {
        key: 'ma',
        name: '移動平均線 MA',
        path: '/technicals/ma',
        fields: [
          { key: 'ma5d', name: '5 日均線', period: 'daily', sort: 1 },
          { key: 'ma10d', name: '10 日均線', period: 'daily', sort: 2 },
          { key: 'ma20d', name: '20 日均線', period: 'daily', sort: 3 },
          { key: 'ma60d', name: '60 日均線', period: 'daily', sort: 4 },
          { key: 'ma120d', name: '120 日均線', period: 'daily', sort: 5 },
          { key: 'ma200d', name: '200 日均線', period: 'daily', sort: 6 },
        ],
      },
      {
        key: 'rsi',
        name: '相對強弱指標 RSI',
        path: '/technicals/rsi',
        fields: [
          { key: 'rsi6d', name: '6 日 RSI', period: 'daily', sort: 1 },
          { key: 'rsi14d', name: '14 日 RSI', period: 'daily', sort: 2 },
          { key: 'rsi24d', name: '24 日 RSI', period: 'daily', sort: 3 },
        ],
      },
      {
        key: 'kd',
        name: '隨機指標 KD',
        path: '/technicals/kd',
        fields: [
          { key: 'k9d', name: '9 日 K值', period: 'daily', sort: 1 },
          { key: 'd9d', name: '9 日 D值', period: 'daily', sort: 2 },
          { key: 'k14d', name: '14 日 K值', period: 'daily', sort: 3 },
          { key: 'd14d', name: '14 日 D值', period: 'daily', sort: 4 },
        ],
      },
      {
        key: 'bollingerBands',
        name: '布林通道',
        path: '/technicals/bollinger-bands',
        fields: [
          { key: 'middle', name: '布林通道中軌', period: 'daily', sort: 1 },
          { key: 'upper', name: '布林通道上軌', period: 'daily', sort: 2 },
          { key: 'lower', name: '布林通道下軌', period: 'daily', sort: 3 },
        ],
      },
      {
        key: 'atr',
        name: '真實波動區間均值 ATR',
        path: '/technicals/atr',
        fields: [
          { key: 'atr14d', name: '14 日 ATR', period: 'daily', sort: 1 },
          { key: 'atr20d', name: '20 日 ATR', period: 'daily', sort: 2 },
        ],
      },
      {
        key: 'bias',
        name: '乖離率 BIAS',
        path: '/technicals/bias',
        fields: [
          { key: 'bias5d', name: '5 日乖離率', period: 'daily', sort: 1 },
          { key: 'bias20d', name: '20 日乖離率', period: 'daily', sort: 2 },
          { key: 'bias60d', name: '60 日乖離率', period: 'daily', sort: 3 },
        ],
      },
      {
        key: 'macd',
        name: 'MACD',
        path: '/technicals/macd',
        fields: [
          { key: 'dif', name: 'DIF', period: 'daily', sort: 1 },
          { key: 'dem', name: 'DEM', period: 'daily', sort: 2 },
          { key: 'osc', name: 'OSC', period: 'daily', sort: 3 },
        ],
      },
      // obv 刻意不列——BigInt 型別、絕對值沒有跨公司比較意義，不適合當篩選欄位，
      // 見 prisma/analysis/schema.prisma 的 ObvResult 註解。
    ],
  },
];
