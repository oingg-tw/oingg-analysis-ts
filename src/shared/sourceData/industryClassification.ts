import { govExportPrisma } from '@/adapters/prisma/govExportClient';
import { logger } from '@/shared/logger';

// 產業同業比較——資料源是 gov-ts 的財政部稅籍行業標準分類（export.company_industry_classification
// + export.industry_codes），五層階層 section/division/group/class/subclass，每家公司最多
// 4 組代碼（rank 0=主要，1-3=次要，這裡只用 rank=0）。
//
// 核心問題：分類層級的「同業密度」是真正的限制——用 999 家已追蹤公司實測，子類層級中位數
// 只有 1 家同業（過半是孤例），中類層級雖然保證有同業但會混進不相關業務（例：健身中心在
// 中類「運動娛樂休閒服務業」的「同業」是主題樂園、KTV）。這裡用動態層級回退解決：從子類
// 開始比對，同業數不足門檻就往更粗一層退，直到湊足或退到中類為止（不繼續往 section 爬，
// gov-ts 的密度分析只測到中類）。

export type IndustryLevel = 'subclass' | 'class' | 'group' | 'division';
const LEVELS: IndustryLevel[] = ['subclass', 'class', 'group', 'division'];

interface CompanyClassification {
  subclass: string | null;
  class: string | null;
  group: string | null;
  division: string | null;
}

interface RawClassificationRow {
  symbol: string;
  subclass_code: string | null;
  class_code: string | null;
  group_code: string | null;
  division_code: string | null;
}

interface RawIndustryNameRow {
  code: string;
  name_zh: string | null;
}

let classificationCache: Map<string, CompanyClassification> | null = null;
let industryNameCache: Map<string, string> | null = null;

const fetchClassificationOnce = async (): Promise<Map<string, CompanyClassification>> => {
  const rows = await govExportPrisma.$queryRaw<RawClassificationRow[]>`
    SELECT symbol, subclass_code, class_code, group_code, division_code
    FROM "export"."company_industry_classification"
    WHERE rank = 0 AND symbol IS NOT NULL
  `;
  const map = new Map<string, CompanyClassification>();
  for (const row of rows) {
    map.set(row.symbol, {
      subclass: row.subclass_code,
      class: row.class_code,
      group: row.group_code,
      division: row.division_code,
    });
  }
  return map;
};

// code 欄位查詢不需要額外帶 level 當複合鍵——已對真實資料內省過（2026-09-05），各層代碼
// 格式天生不會互撞（section 單一字母、division 兩位數字、group 三位數字、class 四位數字、
// subclass 四位數字+dash+兩位數字），見 prisma/govExport/schema.prisma 的 TaxIndustryCode 說明。
const fetchIndustryNamesOnce = async (): Promise<Map<string, string>> => {
  const rows = await govExportPrisma.$queryRaw<RawIndustryNameRow[]>`
    SELECT code, name_zh FROM "export"."industry_codes" WHERE code IS NOT NULL
  `;
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.name_zh) map.set(row.code, row.name_zh);
  }
  return map;
};

// 伺服器啟動時嘗試載入一次——輔助性質，失敗不擋伺服器啟動、也不重試，之後查詢自然退化成
// 「查無分類資料」（見 findPeerGroup 回傳 found:false）。這是記憶體快取，**不落地存 DB
// 副本**——2026-09-04 使用者已經明確否決「curated 中台層」這個方向（曾經蓋過又完整回退），
// 這裡刻意不重蹈覆轍，也不需要：分類資料是輔助查詢用途，不像 industryCodes.ts 那樣要撐
// 指標計算不能開天窗，開天窗的代價只是同業比較這個功能暫時查不到，可接受。只在啟動時抓
// 一次，之後不主動重抓，除非重啟伺服器——分類資料變動慢，先不做定期刷新排程。
export const loadIndustryClassification = async (): Promise<void> => {
  try {
    const [classification, names] = await Promise.all([fetchClassificationOnce(), fetchIndustryNamesOnce()]);
    classificationCache = classification;
    industryNameCache = names;
    logger.info(`[industry-classification]: 已從 gov-ts 載入產業分類（${classification.size} 家公司）跟代碼字典（${names.size} 筆）。`);
  } catch (error) {
    logger.warn({ err: error }, '[industry-classification]: 載入失敗，不影響伺服器啟動；之後的同業比較查詢會回傳查無分類資料（除非重啟伺服器重新載入）。');
  }
};

export interface PeerGroupResult {
  found: boolean;
  level: IndustryLevel | null;
  code: string | null;
  name: string | null;
  peers: string[]; // 含目標公司自己；found=false 時是 []
}

const NOT_FOUND: PeerGroupResult = { found: false, level: null, code: null, name: null, peers: [] };

// 動態層級回退：子類(subclass)→細類(class)→小類(group)→中類(division)，同業數（含自己）
// 達到 minPeers 就停在該層；連 division 都不足門檻仍然停在 division（不繼續往 section
// 爬），即使那樣同業數可能不足。純讀記憶體快取，同步函式，不用 await。
export const findPeerGroup = (symbol: string, candidatePool: ReadonlySet<string>, minPeers: number): PeerGroupResult => {
  if (!classificationCache || !industryNameCache) return NOT_FOUND;
  const target = classificationCache.get(symbol);
  if (!target) return NOT_FOUND;

  let divisionFallback: PeerGroupResult | null = null;
  for (const level of LEVELS) {
    const code = target[level];
    if (code === null) continue;

    const peers = [...candidatePool].filter((s) => s !== symbol && classificationCache!.get(s)?.[level] === code);
    const result: PeerGroupResult = { found: true, level, code, name: industryNameCache.get(code) ?? null, peers: [symbol, ...peers] };
    if (level === 'division') divisionFallback = result;
    if (result.peers.length >= minPeers) return result;
  }

  return divisionFallback ?? NOT_FOUND; // 連 division 代碼都沒有 -> 真的沒有分類資料可比
};
