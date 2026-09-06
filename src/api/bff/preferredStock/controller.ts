import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getPreferredStockSecurities, getLatestPreferredStockRight } from '@/shared/sourceData/preferredStock';
import { getStockPriceAsOf } from '@/shared/sourceData/marketCap';

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
        // 買回風險（call risk）= 發行價 - 現價，只在可贖回（redeemable）時才有意義——發行人
        // 贖回時是按發行價買回，如果現價已經漲超過發行價，這個差額就會是負值，代表投資人
        // 用市價買進卻只能拿回發行價，可能被迫吃下這個負值大小的損失；不可贖回的特別股沒有
        // 這個風險，回傳 null。2026-09-06 使用者更正過方向（原本寫成現價-發行價，已改成
        // 發行價-現價），這裡不要改回去。
        const callRiskAmount = right?.redeemable === true && right.issuePrice != null && price?.closePrice != null ? Math.round((right.issuePrice - price.closePrice) * 100) / 100 : null;

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
          callRiskAmount,
        };
      })
    );

    res.status(200).json({ count: filtered.length, limit, offset, entries });
  } catch (error) {
    next(error);
  }
};
