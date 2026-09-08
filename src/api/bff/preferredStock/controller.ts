import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getPreferredStockSecurities, getLatestPreferredStockRight } from '@/shared/sourceData/preferredStock';
import { getStockPriceAsOf } from '@/shared/sourceData/marketCap';
import { solveYieldToCall, resolveYtcPeriods } from '@/shared/preferredStockYield';
import type { PreferredStockDataSource } from './types';

// 2026-09-07 使用者要求：回應本身要能查證資料來源，顆粒度到來源即可，不用到逐欄位（逐
// 欄位對照見 README.md）。每個 entry 都是同樣這三個上游來源合併出來的，固定不變，所以
// 放在回應最外層一次，不重複塞進每個 entry。
//
// 原本標內部 table 名稱，使用者指出對使用者沒意義，改成跟 twse-ts/mops-ts 要來的公開
// 查證頁面 URL（2026-09-07 跨團隊確認過）：
// - isin_securities（特別股清單）：twse-ts 實際抓取的來源就是這個公開頁面本身（不是
//   API），目前 28 檔特別股全部是「上市」（strMode=2）——twse-ts 提到他們對「上櫃」
//   （strMode=4）有額外例外收錄，但目前資料庫裡沒有任何一檔特別股是上櫃，這裡先只放
//   上市那個頁面連結，之後如果真的出現上櫃特別股要記得補上第二個來源。
// - preferred_stock_right（發行條款）：MOPS 公開資訊觀測站的特別股權利查詢頁，mops-ts
//   已用 2002A/2881A 逐欄位對照過完全吻合。
// - daily_price（收盤價）：twse-ts 同時有機器可讀的 OpenAPI（openapi.twse.com.tw）跟
//   人看的查詢頁兩種來源，這裡選查詢頁——這個欄位是給終端使用者查證用，不是給機器讀的。
// 三個來源目前都是「互動查詢頁」，不是能帶參數直接跳到那一筆記錄的深連結，`note` 說明
// 這個限制。
const PREFERRED_STOCK_DATA_SOURCES: PreferredStockDataSource[] = [
  {
    name: 'TWSE 國際證券辨識號碼（ISIN）一覽表',
    url: 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2',
    note: '查詢頁面，需自行在「特別股」分類區塊裡找到對應股票代號核對，非深連結',
  },
  {
    name: 'MOPS 特別股權利基本資料查詢',
    url: 'https://mopsov.twse.com.tw/mops/web/t47sb12',
    note: '互動查詢頁，需自行輸入公司代號＋市場別查詢，非深連結',
  },
  {
    name: 'TWSE 個股日成交資訊查詢',
    url: 'https://www.twse.com.tw/zh/trading/historical/stock-day.html',
    note: '互動查詢頁，需自行輸入日期與股票代號查詢，非深連結',
  },
];

// 目前只有 28 檔，遠低於這個上限——加分頁是為了跟其他清單型端點（GET /companies）維持
// 一致的介面慣例，也預留之後名單成長的空間，不是現在就有效能疑慮。
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export const getPreferredStocksQuerySchema = z.object({
  symbol: z.string().min(1).optional().meta({ description: '公司代號選填，給了就只回這一檔；不給回全部目前上市中的特別股', example: '1101B' }),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).meta({ description: `這次要拿幾筆，預設 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}。` }),
  offset: z.coerce.number().int().min(0).default(0).meta({ description: '跳過前面幾筆，預設 0。' }),
});

const toRatio2 = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100 * 100) / 100;
};

// 特別股清單 + 發行條款 + 目前殖利率——特別股本身是獨立證券（1101 台泥的普通股 vs 1101B
// 台泥乙特是兩檔不同證券），跟現有 metrics/（假設「一家公司+季度財報+股價」骨架）不合，
// 獨立開一個平行分類，見 preferredStock/README.md 的說明。dividendRate 是「每股固定配息
// 金額」（新台幣元），不是百分比——欄位名稱容易誤會，2026-09-06 逐檔實測驗證過。這裡算兩個
// 不同的百分比：nominalDividendRatePct（票面利率，dividendRate/issuePrice，發行時基準，
// 之後不隨股價變動）跟 currentYieldPct（目前殖利率，dividendRate/最新收盤價，隨股價每天
// 變動）——兩者是不同概念，不要混為一談（例如 2002A 中鋼特票面利率高達 14%，是 1974 年
// 發行當時的利率環境，不代表現在買進的殖利率也是 14%）。只涵蓋 TWSE（上市）——TPEx 目前
// 沒有 isin_securities 這張表，上櫃特別股（如果存在）沒有資料源，是外部缺口不是這批的疏漏。
export const getPreferredStocks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getPreferredStocksQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, limit, offset } = validationResult.data;
    const securities = await getPreferredStockSecurities();
    const filtered = symbol ? securities.filter((s) => s.symbol === symbol) : securities;
    const page = filtered.slice(offset, offset + limit);

    const entries = await Promise.all(
      page.map(async (security) => {
        const [right, price] = await Promise.all([getLatestPreferredStockRight(security.symbol), getStockPriceAsOf(security.symbol, new Date())]);

        const nominalDividendRatePct = right?.dividendRate != null && right.issuePrice != null ? toRatio2(right.dividendRate, right.issuePrice) : null;
        const currentYieldPct = right?.dividendRate != null && price?.closePrice != null ? toRatio2(right.dividendRate, price.closePrice) : null;

        // YTW（最差殖利率）= min(YTC, YTP)。YTP 就是上面已經算好的 currentYieldPct，不用
        // 重算。YTC 只在可贖回、且發行價/配息/現價/贖回日都齊全時才算得出來——見
        // preferredStockYield.ts 檔頭說明，n（期數）依贖回日是否已過分兩種情境，
        // ytcAssumption 標記告訴呼叫端是哪一種。
        let ytcPct: number | null = null;
        let ytcAssumption: 'scheduled_redemption_date' | 'past_redemption_date_assumed_next_period' | null = null;
        if (right?.redeemable === true && right.issuePrice != null && right.dividendRate != null && price?.closePrice != null && right.redemptionDate != null) {
          const { periods, assumption } = resolveYtcPeriods(right.redemptionDate, new Date());
          const ytc = solveYieldToCall({ currentPrice: price.closePrice, dividendRate: right.dividendRate, callPrice: right.issuePrice, periods });
          ytcPct = Math.round(ytc * 100 * 100) / 100;
          ytcAssumption = assumption;
        }
        const ytwPct = ytcPct !== null && currentYieldPct !== null ? Math.min(currentYieldPct, ytcPct) : currentYieldPct;

        // 溢價率 = (現價 − 發行價) / 發行價 * 100，只在可贖回時才有意義（發行人贖回是按
        // 發行價買回，現價已經漲超過發行價時，投資人有被迫在高於市場認知價值處被贖回的
        // 風險）。2026-09-08 改回傳原始百分比取代原本的 negativeConvexityWarning 布林值——
        // 後者只是「溢價率 > 2%」的判斷式，前端本來就會自己算溢價率，兩者是同一個公式重複
        // 曝露成兩種形式，直接給原始數字讓前端自己決定門檻更單純。
        const premiumRatePct = right?.redeemable === true && right.issuePrice != null && price?.closePrice != null ? toRatio2(price.closePrice - right.issuePrice, right.issuePrice) : null;

        return {
          symbol: security.symbol,
          name: security.name,
          isinCode: security.isinCode,
          listedDate: security.listedDate.toISOString().slice(0, 10),
          marketType: security.marketType,
          issueDate: right?.issueDate.toISOString().slice(0, 10) ?? null,
          issuePrice: right?.issuePrice ?? null,
          dividendRate: right?.dividendRate ?? null,
          nominalDividendRatePct,
          currentYieldPct,
          latestClosePrice: price?.closePrice ?? null,
          latestPriceDate: price?.tradeDate ?? null,
          cumulativeDividend: right?.cumulativeDividend ?? null,
          participatingExcessDividend: right?.participatingExcessDividend ?? null,
          liquidationPreference: right?.liquidationPreference ?? null,
          votingRights: right?.votingRights ?? null,
          convertible: right?.convertible ?? null,
          conversionStartDate: right?.conversionStartDate?.toISOString().slice(0, 10) ?? null,
          redeemable: right?.redeemable ?? null,
          redemptionDate: right?.redemptionDate?.toISOString().slice(0, 10) ?? null,
          redemptionConditions: right?.redemptionConditions ?? null,
          ytcPct,
          ytcAssumption,
          ytwPct,
          premiumRatePct,
        };
      })
    );

    res.status(200).json({ count: filtered.length, limit, offset, dataSources: PREFERRED_STOCK_DATA_SOURCES, entries });
  } catch (error) {
    next(error);
  }
};
