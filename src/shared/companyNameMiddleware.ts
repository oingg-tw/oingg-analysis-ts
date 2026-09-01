import { Request, Response, NextFunction } from 'ultimate-express';
import { getCompanyName } from './sourceData/companyProfile';

// 全域掛在 app.use(routes) 之前——回應物件最上層只要有 companyId（字串），就非同步查公司簡稱
// 補上 companyName 再送出，不用每支指標各自記得加這個欄位（2026-09-01 使用者要求「每次都要有
// 公司名稱」，用 middleware 統一補才是架構保證，不是靠每個 service 各自記得）。
//
// 刻意的取捨：這是在 HTTP 層注入，不是在各支 calculate* 函式自己的回傳型別裡加這個欄位——
// RoeResult 這類 TypeScript 型別不會反映 companyName，只有實際送出的 JSON 會有。44+ 個型別
// 檔案為了一個純型別標註去改動，換不到功能上的差異。
//
// 已知不涵蓋的情況：
// - `valuation/ranking` 回傳多家公司的陣列（沒有最上層 companyId），這支 middleware 不處理，
//   要不要、怎麼幫陣列裡每個 item 補名稱是另外的設計。
// - `company_profile` 只鏡像了上市（TWSE）公司，上櫃（TPEx）公司或本來就沒有的代號查無資料，
//   `companyName` 會是 null，不是拋錯——跟本服務其他「查無資料回 null」的慣例一致。
// - 查詢公司名稱本身失敗（例如 DB 暫時連不上）要吞掉錯誤、印 log、照原樣送出，不能讓這個
//   附加行為害到本來就算好的指標結果送不出去，跟「存檔失敗不影響本次回傳」同一種容錯原則。
export const injectCompanyName = (_req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);

  res.json = ((body?: unknown) => {
    if (
      body !== null &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      'companyId' in body &&
      typeof (body as Record<string, unknown>).companyId === 'string' &&
      !('companyName' in body)
    ) {
      const companyId = (body as Record<string, unknown>).companyId as string;
      getCompanyName(companyId)
        .then((companyName) => originalJson({ ...body, companyName }))
        .catch((error) => {
          console.error('[companyNameMiddleware]: 查詢公司名稱失敗，回傳原始結果不補公司名稱。', error);
          originalJson(body);
        });
      return res;
    }

    return originalJson(body);
  }) as typeof res.json;

  next();
};

export default injectCompanyName;
