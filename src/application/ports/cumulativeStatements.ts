import type { QuarterlyKey } from '@/domain/financials/quarterlyKey';
import type { CashFlowFields, IncomeStatementFields } from './financialStatements';

// 2026-10-01 累計（年初至該季）損益表與現金流量表。興櫃依法只申報半年報（Q2）與年報（Q4）、Q1／Q3 免申報，
// 單季表要用「本季累計 − 上季累計」推，興櫃沒有上季可減，所以單季列全是空值（mops-ts 實測：興櫃 364 家
// 單季損益表的列存在但數值全 null，現金流量表單季列不存在；累計表 Q2／Q4 都有值）。使用者拍板為興櫃做半年頻：
// 近一年＝上年度下半年（年報累計 − 上年 Q2 累計）＋本年度上半年（Q2 累計），跟上市櫃的近四季是同一個經濟量。
// 形狀跟單季 DTO 完全相同（千元 bigint），差別只在期間是年初至該季。實作在 infrastructure/repositories/mops/cumulativeStatements.ts。
export interface CumulativeStatementsPort {
  getCumulativeIncomeStatement(key: QuarterlyKey): Promise<IncomeStatementFields | null>;
  getCumulativeCashFlowStatement(key: QuarterlyKey): Promise<CashFlowFields | null>;
}
