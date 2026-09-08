import { registry } from '@/adapters/swagger/registry';
import { getPreferredStocksQuerySchema } from './controller';
import { preferredStocksResultSchema } from './types';

export const registerPreferredStockOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/preferred-stocks',
    summary: '特別股清單（發行條款 + 目前殖利率）',
    description:
      '特別股本身是獨立證券（例如 1101 台泥的普通股 vs 1101B 台泥乙特是兩檔不同證券），跟' +
      '「一家公司+季度財報」骨架的一般指標端點不合，獨立成一支平行分類。symbol 選填，給了' +
      '就只回那一檔（查無資料回 entries: []，不是 404），不給就回全部目前上市中的特別股' +
      '（2026-09-06 實測共 28 檔）。只涵蓋 TWSE（上市）——TPEx 目前沒有對應的證券登記資料，' +
      '上櫃特別股（如果存在）沒有資料源。' +
      'dividendRate 是「每股固定配息金額」（新台幣元），不是百分比，欄位名稱容易誤會。' +
      '這裡算兩個不同的百分比：nominalDividendRatePct（票面利率，dividendRate/issuePrice，' +
      '發行時基準，之後不隨股價變動）跟 currentYieldPct（目前殖利率，dividendRate/最新收盤價，' +
      '隨股價每天變動，查無股價資料時為 null）——兩者是不同概念，票面利率偏高不代表現在買進的' +
      '殖利率也高（例如 2002A 中鋼特票面利率 14% 是 1974 年發行當時的利率環境）。' +
      'redeemable/redemptionDate/redemptionConditions 描述的是發行人贖回權（call，公司單方' +
      '面選擇是否買回），不是投資人賣回權（put）——這批資料源沒有投資人賣回權的欄位。' +
      'redemptionVerified（2026-09-08 新增）標示這檔是否經過人工查證章程確認收回權利，' +
      '跟 redemptionDate 是否為 null 是兩件事——有些特別股已查證確認可收回，但條款本身' +
      '沒有固定收回日，redemptionDate 仍是 null，這個欄位用來區分「已查證只是沒有固定' +
      '日期」跟「還沒有人查證過」。' +
      'limit/offset 分頁沿用 GET /companies 的慣例。' +
      'dataSources 是給終端使用者查證用的公開頁面連結（TWSE ISIN 網站/MOPS 特別股權利查詢/' +
      'TWSE 個股日成交資訊查詢），不是內部資料庫的表名——顆粒度到來源，不到逐欄位（逐欄位' +
      '對照見 preferredStock/README.md），每個 entry 都是同一組來源組成的。這些連結目前' +
      '都是互動查詢頁，不是能帶參數直接跳到某一筆記錄的深連結，需要使用者自行輸入公司代號/' +
      '日期查詢，note 欄位會說明這一點。' +
      'ytwPct（最差殖利率 YTW）= min(currentYieldPct, ytcPct)——currentYieldPct 就是永續殖利率' +
      '（YTP）；ytcPct（贖回殖利率 YTC）用二分法對現金流現值公式求根，只在可贖回且發行價/配息/' +
      '現價都齊全時才有值，不再要求 redemptionDate 非 null（2026-09-08 起）。ytcAssumption ' +
      '標記 ytcPct 的期數假設，三種情境：贖回日還沒到（scheduled_redemption_date，用真實到' +
      '贖回日的年數）；有排定贖回日但已經過了（past_redemption_date_assumed_next_period）；' +
      '條款本身就沒有排定贖回日（no_scheduled_redemption_date_assumed_next_period，例如' +
      '1312A/2002A，公司可隨時自行決定）。後兩種都假設「下一次配息後即被贖回」的簡化情境，' +
      '不是真實排定的時間，只是起點狀態不同（有過期日 vs 從來沒有日期），前端顯示時應該根據' +
      'ytcAssumption 額外標註不同措辭的警語。' +
      'premiumRatePct（溢價率）= (最新收盤價 − 發行價) / 發行價 * 100，只在可贖回時才計算——' +
      '現價高於發行價代表投資人可能被發行人用發行價買回、被迫吃下溢價部分的損失，前端可以' +
      '自行決定要用什麼門檻標示風險。' +
      'sortField/sortOrder（2026-09-08 新增）：sortField 只能是 symbol/issueDate/listedDate/' +
      'issuePrice/dividendRate/nominalDividendRatePct/currentYieldPct/ytcPct/ytwPct/' +
      'premiumRatePct 這幾個排名/日期類欄位，不給就維持 symbol 字母序；sortOrder 是 asc/desc，' +
      '預設 asc。排序在分頁之前套用（先排序全部符合條件的結果，再切 limit/offset），跨頁順序' +
      '正確。null 值（例如不可贖回沒有 ytcPct）一律排在最後，不管 asc/desc，避免被誤讀成' +
      '最小值。',
    tags: ['Stocks'],
    request: { query: getPreferredStocksQuerySchema },
    responses: {
      200: { description: '特別股清單，查無資料（symbol 篩選後沒有結果）時 entries 是空陣列，count 一律是全部符合條件的總筆數（不受 limit/offset 影響）。', content: { 'application/json': { schema: preferredStocksResultSchema } } },
      400: { description: 'symbol/limit/offset 格式錯誤。' },
    },
  });
};
