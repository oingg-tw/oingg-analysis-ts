import type { OutstandingCommonSharesAsOf } from '@/application/ports/capitalStock';
import { toProvenanceEntryValue, type ProvenanceEntry } from './provenanceTypes';

// 2026-10-01 每股類溯源表的「股數」列。2026-09-25 起分母是 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股）、EPS 類分子扣
// 特別股股利、每股淨值類分子扣特別股清償金額（見 domain/financials/outstandingCommonShares.ts），但溯源表一直只列一個「流通股數」、
// 分子也沒扣——2881／2882／2887 這類有特別股的公司溯源值跟寫入值差 2~8%。這裡把拆解列出來，讓「為什麼除的是這個數」看得到：
// 流通在外普通股是計算真正用的分母，後面三列是它的組成；扣除項只在指標真的有扣的時候列。
const other = (role: string, fiscalYear: number, fiscalQuarter: number, value: bigint | null, sourceDescription: string): ProvenanceEntry => ({
  role, fiscalYear, fiscalQuarter, type: 'other', statementType: null, fieldKey: null, sourceDescription, value: toProvenanceEntryValue(value),
});

const SOURCE = '公開發行公司股本變動申報（已發行股數）＋資產負債表特別股股本＋庫藏股申報';

export const commonShareEntries = (
  shares: OutstandingCommonSharesAsOf | null,
  fiscalYear: number,
  fiscalQuarter: number,
  options: { label?: string; preferredDividends?: 'TTM' | 'Q'; preferredClaim?: boolean } = {}
): ProvenanceEntry[] => {
  const label = options.label ?? '本季報告日';
  return [
    other(`${label}流通在外普通股（每股分母＝已發行 − 特別股 − 庫藏股）`, fiscalYear, fiscalQuarter, shares?.outstandingCommonShares ?? null, SOURCE),
    other(`${label}已發行股數（含特別股、庫藏股）`, fiscalYear, fiscalQuarter, shares?.issuedShares ?? null, '公開發行公司股本變動申報'),
    other(`${label}特別股股數（特別股股本 ÷ 面額）`, fiscalYear, fiscalQuarter, shares?.preferredShares ?? null, '資產負債表特別股股本'),
    other(`${label}庫藏股股數（本公司及子公司持有）`, fiscalYear, fiscalQuarter, shares?.treasuryShares ?? null, '庫藏股申報'),
    ...(options.preferredDividends
      ? [
          other(
            options.preferredDividends === 'Q' ? '近四季特別股股利（千元；單季分子扣四分之一，只算普通股盈餘）' : '近四季特別股股利（千元；從淨利扣除，只算普通股盈餘）',
            fiscalYear,
            fiscalQuarter,
            shares?.preferredDividendsTtmThousands ?? null,
            '權益變動表特別股股利宣告數'
          ),
        ]
      : []),
    ...(options.preferredClaim ? [other('特別股清償金額（千元，按發行價；從權益扣除，只算普通股淨值）', fiscalYear, fiscalQuarter, shares?.preferredClaimThousands ?? null, '特別股股本＋股利公告的發行價')] : []),
  ];
};
