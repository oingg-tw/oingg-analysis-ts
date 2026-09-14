import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getCompanyProfileDetail, getCompanyNamesForSymbols, getSecuritySymbolSet } from '@/models/companyProfile';
import { findPeerGroup } from '@/models/playwright/industryChainClassification';

export const getCompanyPeerGroupQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  minPeers: z.coerce.number().int().min(1).max(50).default(3).meta({ description: '同業數（含自己）低於這個門檻就往更粗的分類回退，預設 3。' }),
  minConfidence: z.coerce.number().min(0).max(1).default(0.6).meta({ description: '候選同業自己的分類信心分數（categoryCount/sampleSize）門檻，低於這個門檻的公司不列入同業池，預設 0.6。' }),
  minSampleSize: z.coerce.number().int().min(0).default(1).meta({ description: '候選同業自己已分類的供應鏈邊數量門檻，低於這個門檻的公司不列入同業池，預設 1。' }),
});

// 給前端「產業同業比較」功能用——找出同業清單，不含財務指標數值：呼叫端拿到 peers 之後
// 應該自己再打 POST /screener/values（symbols + columns）查實際指標數值，這支端點跟
// screener/values 是刻意分開的兩支，不重複做數值查詢那一層。2026-09-08：screener 這套
// 查詢引擎已經重建成直接讀 pitMetrics 的 metric_values（field 格式改成
// "metricCode.basis"，例如 "roe.TTM"，見 GET /metrics 的可用清單），不是原本靠
// metricTableRegistry 解析舊架構表的那套（那套已隨無真實依賴的 filterCatalog 一起退場）。
//
// 2026-09-14：資料源從 gov-ts 財政部稅籍行業標準分類換成 oingg-playwright-py 的供應鏈
// 分類（Gemini 解析真實供應關係得出的 product_category），破壞性變更（industryLevel/
// industryCode/industryName 換成 classificationLevel/confidence/sampleSize），已在
// dev 環境驗證後通知 bff-ts。用細分類→粗分類兩層回退找同業，見
// src/models/playwright/industryChainClassification.ts 的說明。
//
// 查無分類資料（found: false）分兩種成因，這支端點刻意不區分：(1) 這家公司是真實存在、可
// 交易的公司，但供應鏈報告完全沒提到它、沒有任何已分類的邊；(2) symbol 打錯或根本不是
// 真實存在的證券——驗證「公司存不存在」是 /companies/profile 的職責，這支端點不重複做。
// KY 股（境外註冊公司）額外查一次 shortName 判斷，命中就在 warnings 提醒呼叫端注意——
// 供應鏈分類不像稅籍分類那樣對 KY 股有結構性的資料缺口（KY 股一樣可能出現在供應鏈報告
// 裡），所以警語只提醒「這批分類可能沒涵蓋到」，不再宣稱是永久性、結構性的缺口。
export const getCompanyPeerGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyPeerGroupQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, minPeers, minConfidence, minSampleSize } = validationResult.data;
    const candidatePool = await getSecuritySymbolSet({ preferredStock: 'exclude' });
    const result = findPeerGroup(symbol, candidatePool, minPeers, { minConfidence, minSampleSize });

    if (!result.found) {
      const warnings: string[] = [];
      const profile = await getCompanyProfileDetail(symbol);
      if (profile?.shortName?.includes('-KY')) {
        warnings.push('這是境外註冊（KY）公司，本服務的產業分類資料（來源：oingg-playwright-py 供應鏈分類）目前沒有涵蓋到這家公司——請確認是否要在呼叫前先篩掉 KY 股。');
      }
      return res.status(200).json({ symbol, companyName: profile?.shortName ?? null, found: false, classificationLevel: null, industryCode: null, industryName: null, confidence: null, sampleSize: null, peers: [], warnings });
    }

    const nameMap = await getCompanyNamesForSymbols(result.peers);
    const warnings: string[] = [];
    if (result.level === 'coarseGroup') {
      warnings.push(`同業數在較細的「${result.category ?? ''}」分類下不足 ${minPeers} 家，已回退到更粗的分類層級（${result.name ?? result.code}），同業裡可能包含商業模式不同的公司，請自行判斷比較的參考價值。`);
    }
    if (result.confidence !== null && result.confidence < minConfidence) {
      warnings.push(`這家公司自己的分類信心分數（${result.confidence}）低於門檻（${minConfidence}），代表它的供應鏈邊分散在多個分類、眾數不夠集中，這次同業比較的參考價值可能較低。`);
    }
    res.status(200).json({
      symbol,
      companyName: nameMap.get(symbol) ?? null,
      found: true,
      classificationLevel: result.level,
      industryCode: result.code,
      industryName: result.name,
      confidence: result.confidence,
      sampleSize: result.sampleSize,
      peers: result.peers.map((s) => ({ symbol: s, companyName: nameMap.get(s) ?? null })),
      warnings,
    });
  } catch (error) {
    next(error);
  }
};
