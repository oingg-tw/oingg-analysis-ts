import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getCompanyProfileDetail, getCompanyNamesForSymbols, getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';
import { findPeerGroup } from '@/shared/sourceData/industryClassification';

export const getCompanyPeerGroupQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  minPeers: z.coerce.number().int().min(1).max(50).default(3).meta({ description: '同業數（含自己）低於這個門檻就往更粗的層級回退，預設 3。' }),
});

// 給前端「產業同業比較」功能用——找出同業清單，不含財務指標數值：呼叫端拿到 peers 之後
// 應該自己再打 POST /screener/values（symbols + columns）查實際指標數值，這支端點跟
// screener/values 是刻意分開的兩支，不重複做數值查詢那一層。2026-09-08：screener 這套
// 查詢引擎已經重建成直接讀 pitMetrics 的 metric_values（field 格式改成
// "metricCode.basis"，例如 "roe.TTM"，見 GET /metrics 的可用清單），不是原本靠
// metricTableRegistry 解析舊架構表的那套（那套已隨無真實依賴的 filterCatalog 一起退場）。
// 用動態層級回退（子類→細類→小類→中類）找同業，見
// src/shared/sourceData/industryClassification.ts 的說明。
//
// 查無分類資料（found: false）分兩種成因，這支端點刻意不區分：(1) 這家公司是真實存在、可
// 交易的公司，但 gov-ts 這批稅籍分類資料沒涵蓋到（例如資料落後）；(2) symbol 打錯或根本
// 不是真實存在的證券——驗證「公司存不存在」是 /companies/profile 的職責，這支端點不重複做。
// 唯一的例外是 KY 股（境外註冊公司，結構上沒有台灣稅籍，永遠不會有分類資料）：這是一個
// 系統性、可預期的缺口，不是隨機的資料落後，所以會額外查一次 shortName 判斷，命中就在
// warnings 明確提醒呼叫端「請在呼叫前先篩掉 KY 股」，不要讓上游誤以為是暫時性的資料缺漏。
export const getCompanyPeerGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyPeerGroupQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, minPeers } = validationResult.data;
    const candidatePool = await getSecuritySymbolSet({ preferredStock: 'exclude' });
    const result = findPeerGroup(symbol, candidatePool, minPeers);

    if (!result.found) {
      const warnings: string[] = [];
      const profile = await getCompanyProfileDetail(symbol);
      if (profile?.shortName?.includes('-KY')) {
        warnings.push('這是境外註冊（KY）公司，沒有台灣稅籍登記，本服務的產業分類資料（來源：財政部稅籍登記）結構上無法涵蓋，不是暫時性的資料缺漏——請在呼叫前先篩掉 KY 股，不要送進這支端點。');
      }
      return res.status(200).json({ symbol, companyName: profile?.shortName ?? null, found: false, industryLevel: null, industryCode: null, industryName: null, peers: [], warnings });
    }

    const nameMap = await getCompanyNamesForSymbols(result.peers);
    res.status(200).json({
      symbol,
      companyName: nameMap.get(symbol) ?? null,
      found: true,
      industryLevel: result.level,
      industryCode: result.code,
      industryName: result.name,
      peers: result.peers.map((s) => ({ symbol: s, companyName: nameMap.get(s) ?? null })),
      warnings: result.level === 'division' ? [`同業數在較細的層級不足 ${minPeers} 家，已回退到最粗的「中類」層級（${result.name ?? result.code}），同業裡可能包含商業模式不同的公司，請自行判斷比較的參考價值。`] : [],
    });
  } catch (error) {
    next(error);
  }
};
