// 2026-09-25 年報（年度財務報告）——跟「第四季單季」是兩個概念，使用者拍板必須分開
// （見 UBIQUITOUS_LANGUAGE.md〈三、期間口徑〉）。key **刻意沒有 quarter**：要全年數字只能走這裡，
// 不能拿 QuarterlyKey 帶 quarter: 4 去撈，從介面上就拿不到錯的那一邊。
export interface AnnualReportKey {
  symbol: string;
  rocYear: number; // 民國年，跟 QuarterlyKey.year 同一個慣例
  dataType: string;
  subsidiaryCompanyId: string;
}

export interface AnnualIncomeStatement {
  reportDate: Date; // 年度期末日（12/31）
  // 年報公告的基本每股盈餘（元）——官方用全年加權平均流通股數算，跟我們「期末股本」口徑的每股數字不同；
  // 年報有、但這個科目沒揭露時為 null。
  basicEps: number | null;
}

export interface AnnualReportPort {
  // 查無該年度年報回 null。
  getAnnualIncomeStatement(key: AnnualReportKey): Promise<AnnualIncomeStatement | null>;
}
