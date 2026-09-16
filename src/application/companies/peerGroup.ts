import type { AppDeps } from '@/application/deps';

// 2026-09-17 Phase 4：從 http/modules/companies/companyPeerGroupController.ts 搬來，資料存取改走 deps
// （companyProfiles、industryReference 的樹狀同業搜尋 + 產業標籤），邏輯逐字不變。
export type CompanyPeerGroupDeps = Pick<AppDeps, 'companyProfiles' | 'industryReference'>;

export interface GetCompanyPeerGroupQuery {
  symbol: string;
  minPeers: number; // 同業數（含自己）低於這個門檻就往樹的上一層退
}

export interface CompanyPeerEntry {
  symbol: string;
  companyName: string | null;
}

export interface CompanyPeerGroupResult {
  symbol: string;
  companyName: string | null;
  found: boolean;
  notFoundReason: 'not_classified' | 'insufficient_peers' | null;
  peerGroupLevel: 'coarse_group' | 'category' | 'segment' | 'misc' | null;
  peerGroupNodeId: string | null;
  peerGroupLabel: string | null;
  category: string | null;
  coarseGroup: string | null;
  source: 'keyword' | 'gemini' | null;
  updatedAt: string | null;
  peers: CompanyPeerEntry[];
  warnings: string[];
}

// 給前端「產業同業比較」功能用——找出同業清單，不含財務指標數值：呼叫端拿到 peers 之後
// 應該自己再打 POST /screener/values（symbols + columns）查實際指標數值，這支端點跟
// screener/values 是刻意分開的兩支，不重複做數值查詢那一層。2026-09-08：screener 這套
// 查詢引擎已經重建成直接讀 pitMetrics 的 metric_values（field 格式改成
// "metricCode.basis"，例如 "roe.TTM"，見 GET /metrics 的可用清單），不是原本靠
// metricTableRegistry 解析舊架構表的那套（那套已隨無真實依賴的 filterCatalog 一起退場）。
//
// 2026-09-14：資料源從 gov-ts 財政部稅籍行業標準分類換成 oingg-playwright-py 的供應鏈
// 分類；2026-09-15 第二次改版：同業比較演算法改用「產業追蹤」樹（見
// infrastructure/repositories/playwright/industryTree.ts 的 findPeerGroupByTree）的葉節點當第一選擇，
// 不再用 33 類 category 當第一選擇——樹狀結構（粗分類→產業→產業內區隔 1~3 層→公司）
// 比扁平兩層更貼近「真正共用上下游的同業」。category/coarseGroup/source 這組資訊仍然存在
// （company_category_summary 沒有下線），但降級為純資訊性欄位（這家公司的「產業標籤」）。
//
// 查無同業分兩種成因，回應用 notFoundReason 明確區分（2026-09-15 第二次改版新增，見
// findPeerGroupByTree 的說明）：not_classified 代表這家公司完全不在產業追蹤樹裡（供應鏈
// 報告沒提到，可能是 symbol 打錯，也可能是真實存在但沒被涵蓋——驗證「公司存不存在」是
// /companies/profile 的職責，這支端點不重複做）；insufficient_peers 代表退到樹的根節點
// 都湊不到 minPeers 家，playwright-py 明確要求這種情況要老實回「同業不足」，不強行湊一個
// 低於門檻的結果。KY 股（境外註冊公司）額外查一次 shortName 判斷，命中就在 warnings 提醒
// 呼叫端注意——供應鏈分類不像稅籍分類那樣對 KY 股有結構性的資料缺口。
export const getCompanyPeerGroup = async ({ symbol, minPeers }: GetCompanyPeerGroupQuery, deps: CompanyPeerGroupDeps): Promise<CompanyPeerGroupResult> => {
  const candidatePool = await deps.companyProfiles.getSecuritySymbolSet({ preferredStock: 'exclude' });
  const result = deps.industryReference.findPeerGroupByTree(symbol, candidatePool, minPeers);
  const categoryInfo = deps.industryReference.getCompanyCategoryInfo(symbol);

  if (!result.found) {
    const warnings: string[] = [];
    const profile = await deps.companyProfiles.getCompanyProfileDetail(symbol);
    if (profile?.shortName?.includes('-KY')) {
      warnings.push('這是境外註冊（KY）公司，本服務的產業分類資料（來源：oingg-playwright-py 供應鏈分類）目前沒有涵蓋到這家公司——請確認是否要在呼叫前先篩掉 KY 股。');
    }
    if (result.notFoundReason === 'insufficient_peers') {
      warnings.push(`即使退到最粗的分類層級，扣除自己後同業數仍不到 ${minPeers} 家，本次查詢不強行湊一個同業數不足的結果，請考慮調低 minPeers 或改用更寬鬆的比較方式。`);
    }
    return {
      symbol,
      companyName: profile?.shortName ?? null,
      found: false,
      notFoundReason: result.notFoundReason,
      peerGroupLevel: null,
      peerGroupNodeId: null,
      peerGroupLabel: null,
      category: categoryInfo?.category ?? null,
      coarseGroup: categoryInfo?.coarseGroup ?? null,
      source: categoryInfo?.source ?? null,
      updatedAt: categoryInfo?.updatedAt?.toISOString().slice(0, 10) ?? null,
      peers: [],
      warnings,
    };
  }

  const nameMap = await deps.companyProfiles.getCompanyNamesForSymbols(result.peers);
  const warnings: string[] = [];
  if (result.nodeType === 'coarse_group') {
    warnings.push(`同業數在更細的分類層級下不足 ${minPeers} 家，已一路回退到最粗的粗分類層級（${result.label ?? result.nodeId}），同業裡可能包含商業模式不同的公司，請自行判斷比較的參考價值。`);
  } else if (result.nodeType === 'category') {
    warnings.push(`同業數在產業內區隔層級不足 ${minPeers} 家，已回退到整個產業層級（${result.label ?? result.nodeId}），同業裡可能包含上下游位置不同的公司，請自行判斷比較的參考價值。`);
  }
  return {
    symbol,
    companyName: nameMap.get(symbol) ?? null,
    found: true,
    notFoundReason: null,
    peerGroupLevel: result.nodeType,
    peerGroupNodeId: result.nodeId,
    peerGroupLabel: result.label,
    category: categoryInfo?.category ?? null,
    coarseGroup: categoryInfo?.coarseGroup ?? null,
    source: categoryInfo?.source ?? null,
    updatedAt: categoryInfo?.updatedAt?.toISOString().slice(0, 10) ?? null,
    peers: result.peers.map((s) => ({ symbol: s, companyName: nameMap.get(s) ?? null })),
    warnings,
  };
};
