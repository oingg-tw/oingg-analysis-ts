import { getCompanyName } from './sourceData/companyProfile';

// 取代原本的 companyNameMiddleware.ts（2026-09-01 使用者要求砍掉那個全域覆寫 res.json、
// 用「回應最上層剛好有沒有 companyId」猜形狀的隱性做法）——這裡改成每個單一公司 controller
// 自己明確呼叫，不再是悄悄套用在全部回應上的黑箱。查詢公司名稱本身失敗（例如 DB 暫時連不上）
// 要吞掉錯誤、印 log、照原樣送出，不能讓補名稱這個附加行為害到本來就算好的指標結果送不出去，
// 跟本服務其他「存檔失敗不影響本次回傳」的容錯原則一致。
//
// res 只要求結構上有 status().json() 就好，不綁死 express 或 ultimate-express 的 Response
// 型別——這個專案兩種都有 controller 在用，用結構型別才不會因為匯入來源不同而型別對不上。
interface JsonResponse {
  status: (code: number) => { json: (body: unknown) => void };
}

export const sendWithCompanyName = async <T extends { companyId: string }>(res: JsonResponse, result: T): Promise<void> => {
  try {
    const companyName = await getCompanyName(result.companyId);
    res.status(200).json({ ...result, companyName });
  } catch (error) {
    console.error('[sendWithCompanyName]: 查詢公司名稱失敗，回傳原始結果不補公司名稱。', error);
    res.status(200).json(result);
  }
};
