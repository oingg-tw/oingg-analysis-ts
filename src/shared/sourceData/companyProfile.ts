import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import type { CompanyProfileDetail } from '@/domains/companies/types';

interface RawTpexCompanyProfileRow {
  symbol: string;
  short_name: string | null;
}

// 只查公司簡稱，給 src/shared/registerCompanyRoute.ts（單一公司端點）用——company_profile 目前只鏡像了
// symbol/name/shortName 幾個欄位（見 prisma/twse/schema.prisma、prisma/tpexExport/schema.prisma
// 開頭說明）。上市（TWSE）查無資料再查上櫃（TPEx），兩邊都查無資料才回傳 null，不拋錯——
// 呼叫端要把這個當作「查不到名稱」的正常情境。
//
// TPEx 這邊 2026-09-01 改走 export.company_profile（tpexExportPrisma，$queryRaw——這張 view
// 沒有唯一識別欄位，Prisma Client 不會產生 model 存取子），取代原本讀 tpex-ts dev 環境的舊帳號。
export const getCompanyName = async (companyId: string): Promise<string | null> => {
  const twseProfile = await twsePrisma.companyProfile.findUnique({ where: { symbol: companyId }, select: { shortName: true } });
  if (twseProfile) return twseProfile.shortName;

  const tpexRows = await tpexExportPrisma.$queryRaw<RawTpexCompanyProfileRow[]>`
    SELECT symbol, short_name FROM "export"."company_profile" WHERE symbol = ${companyId} LIMIT 1
  `;
  return tpexRows[0]?.short_name ?? null;
};

// GET /stocks/:symbol/quote 用——判斷這家公司到底存不存在（上市或上櫃任一邊有登記），
// 不存在才回 404；存在但查無股價/估值資料是另一回事（回 200，欄位是 null）。
export const companyExists = async (companyId: string): Promise<boolean> => {
  const [twseHit, tpexRows] = await Promise.all([
    twsePrisma.companyProfile.findUnique({ where: { symbol: companyId }, select: { symbol: true } }),
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile" WHERE symbol = ${companyId} LIMIT 1`,
  ]);
  return twseHit !== null || tpexRows.length > 0;
};

// 給「排除 ETF/衍生性商品，只留真正的上市櫃公司」用（2026-09-01 應使用者要求新增——排行榜這類
// 主打/推薦性質的功能，不該把 00852L 這種槓桿/反向 ETF 跟真正的公司股票混在一起排）。
// company_profile 只會有真正登記的公司（symbol/name/tax_id 等公司基本資料），ETF/權證/
// 衍生商品不會出現在裡面——用這個當「是不是真正的公司」的判斷依據，比自己猜代號規則
// （00 開頭、L/R 結尾）可靠，那些規則可能有例外。上市（TWSE）、上櫃（TPEx）分開查，因為
// 呼叫端通常各自查各自市場的表（例如 ranking 的 queryTwseMarket/queryTpexMarket），不需要
// 合併成一個跨市場集合。
//
// 2026-09-02 發現 company_profile 其實混了兩種來源：TWSE 用 source 欄位區分
// 'COMPANY_PROFILE'（真正上市、1,095 筆全部有股價）vs 'COMPANY_PROFILE_PUBLIC'（更廣的
// 「公開發行公司」，299 筆裡只有 5 筆有股價，混入證券商登記等非交易性質的代號，例如
// 000104=臺銀證券——這些不是「公司股票」，要排除）。這裡加上 source 篩選，之前沒篩會讓
// revenueRanking 這類吃 monthly_revenue（公開發行公司範疇比股價範疇廣）的功能把這些幽靈
// 代號當成真公司排進去。
//
// TPEx 這邊的 market 欄位只有兩種值：'COMPANY_PROFILE'（一般上櫃）跟
// 'COMPANY_PROFILE_EMERGING'（興櫃）——興櫃公司雖然沒有一般交易的股價資料（改用議價/
// 逐筆撮合，不進 daily_price 鏡像），但本身是合法登記、有公開揭露義務的公司，不是像 TWSE
// 那種非公司性質的登記資料，使用者 2026-09-02 明確要求兩種都算「真正公司」，所以這裡
// 不篩 market，維持原樣（兩種值都留）。
export const getTwseCompanySymbolSet = async (): Promise<Set<string>> => {
  const rows = await twsePrisma.companyProfile.findMany({ where: { source: 'COMPANY_PROFILE' }, select: { symbol: true } });
  return new Set(rows.map((row) => row.symbol));
};

export const getTpexCompanySymbolSet = async (): Promise<Set<string>> => {
  const rows = await tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile"`;
  return new Set(rows.map((row) => row.symbol));
};

// 給 GET /companies/symbols 用（2026-09-02 應使用者要求新增）——mops-ts 之前請我們手動貼一份
// 「真正公司代號清單」給他們做 capital_stock_history 全市場回補，貼靜態清單容易過時/貼錯
// （已經發生過一次：第一版漏算興櫃），改成端點讓他們自己即時打，跟這裡的篩選定義（見上面
// getTwseCompanySymbolSet/getTpexCompanySymbolSet 的說明）永遠同步，不用兩邊各自維護一份。
export const getAllRealCompanySymbols = async (): Promise<string[]> => {
  const [twseSymbols, tpexSymbols] = await Promise.all([getTwseCompanySymbolSet(), getTpexCompanySymbolSet()]);
  return [...new Set([...twseSymbols, ...tpexSymbols])].sort();
};

interface RawTpexCompanyProfileDetailRow {
  symbol: string;
  report_date: Date | null;
  name: string | null;
  short_name: string | null;
  foreign_registration_country: string | null;
  industry: string | null;
  address: string | null;
  tax_id: string | null;
  chairman: string | null;
  general_manager: string | null;
  spokesperson: string | null;
  spokesperson_title: string | null;
  deputy_spokesperson: string | null;
  phone: string | null;
  established_date: Date | null;
  listed_date: Date | null;
  par_value: string | null;
  paid_in_capital: bigint | null;
  private_placement_shares: bigint | null;
  preferred_stock_shares: bigint | null;
  financial_report_type: string | null;
  stock_transfer_agency: string | null;
  transfer_agency_phone: string | null;
  transfer_agency_address: string | null;
  auditing_firm: string | null;
  auditor1: string | null;
  auditor2: string | null;
  english_short_name: string | null;
  fax_number: string | null;
  email: string | null;
  website: string | null;
  issued_shares: bigint | null;
}

// 這 5 個 industry 代碼的 industry_name 不是真正的產業分類，是 twse-ts 自己為了說明「這代碼
// 其實是別的訊號」加的附註文字（2026-09-02 跟 twse-ts 確認過，src/shared/industryCodes.ts
// 的檔頭註解——XX=證券商、98=期貨商、91=第一上市外國公司身份別、07=舊產業代碼殘留，都是
// 給工程師看的說明，不是給終端使用者看的），對外端點不透傳這幾個，回 null。13（電子工業，
// 2007 分類改制前的舊類別）雖然也帶「（舊分類）」附註，但核心名稱本身是真正的產業名稱，
// 不在這個清單裡，照樣透傳。
const NON_INDUSTRY_CODES = new Set(['07', '91', '98', 'XX']);
const resolveIndustryName = (industry: string | null, industryName: string | null): string | null =>
  industry !== null && NON_INDUSTRY_CODES.has(industry) ? null : industryName;

// MOPS 沒有公開的欄位字典，2026-09-02 跟 mops-ts 確認過：'1'=個別財報、'2'=合併財報——他們
// 專案內部從三表 domain 開始就用同一套 dataType 慣例（見 profitability/roe 等 controller 的
// 「1 = 個體, 2 = 合併」註解），另外用 MOPS t164sb01 端點的 REPORT_ID 參數 'A'（個別）/
// 'C'（合併）交叉印證過，信心度高但不是官方白紙黑字文件，未知代碼一律回 null，不亂猜。
const FINANCIAL_REPORT_TYPE_NAMES: Record<string, string> = { '1': '個別財報', '2': '合併財報' };
const resolveFinancialReportTypeName = (financialReportType: string | null): string | null =>
  financialReportType !== null ? (FINANCIAL_REPORT_TYPE_NAMES[financialReportType] ?? null) : null;

// 給 GET /companies/profile 用（2026-09-02 應 bff-ts 要求新增，個股詳情頁的公司基本資料卡片）。
// 上市（TWSE）查無資料再查上櫃（TPEx），兩邊都查無資料回傳 null。TWSE/TPEx 兩邊 company_profile
// 欄位範圍不完全一樣（TPEx 沒有 english_address/industry_name），沒有的欄位一律回 null，不是
// 查詢失敗。這裡刻意不篩 source/market——單一公司查詢是使用者/下游服務指名要看這家公司的資料，
// 不是「排除幽靈代號」那種清單情境（見 getTwseCompanySymbolSet 的說明），就算是
// COMPANY_PROFILE_PUBLIC 這類非交易性質的登記資料，指名查询時一樣照實回傳。
export const getCompanyProfileDetail = async (companyId: string): Promise<CompanyProfileDetail | null> => {
  const twseRow = await twsePrisma.companyProfile.findUnique({ where: { symbol: companyId } });
  if (twseRow) {
    return {
      symbol: twseRow.symbol,
      market: 'TWSE',
      reportDate: twseRow.reportDate.toISOString().slice(0, 10),
      name: twseRow.name,
      shortName: twseRow.shortName,
      foreignRegistrationCountry: twseRow.foreignRegistrationCountry,
      industry: twseRow.industry,
      industryName: resolveIndustryName(twseRow.industry, twseRow.industryName),
      address: twseRow.address,
      taxId: twseRow.taxId,
      chairman: twseRow.chairman,
      generalManager: twseRow.generalManager,
      spokesperson: twseRow.spokesperson,
      spokespersonTitle: twseRow.spokespersonTitle,
      deputySpokesperson: twseRow.deputySpokesperson,
      phone: twseRow.phone,
      establishedDate: twseRow.establishedDate?.toISOString().slice(0, 10) ?? null,
      listedDate: twseRow.listedDate?.toISOString().slice(0, 10) ?? null,
      parValue: twseRow.parValue ? Number(twseRow.parValue) : null,
      paidInCapital: twseRow.paidInCapital?.toString() ?? null,
      privatePlacementShares: twseRow.privatePlacementShares?.toString() ?? null,
      preferredStockShares: twseRow.preferredStockShares?.toString() ?? null,
      financialReportType: twseRow.financialReportType,
      financialReportTypeName: resolveFinancialReportTypeName(twseRow.financialReportType),
      stockTransferAgency: twseRow.stockTransferAgency,
      transferAgencyPhone: twseRow.transferAgencyPhone,
      transferAgencyAddress: twseRow.transferAgencyAddress,
      auditingFirm: twseRow.auditingFirm,
      auditor1: twseRow.auditor1,
      auditor2: twseRow.auditor2,
      englishShortName: twseRow.englishShortName,
      englishAddress: twseRow.englishAddress,
      faxNumber: twseRow.faxNumber,
      email: twseRow.email,
      website: twseRow.website,
      issuedShares: twseRow.issuedShares?.toString() ?? null,
    };
  }

  const tpexRows = await tpexExportPrisma.$queryRaw<RawTpexCompanyProfileDetailRow[]>`
    SELECT symbol, report_date, name, short_name, foreign_registration_country, industry, address, tax_id,
      chairman, general_manager, spokesperson, spokesperson_title, deputy_spokesperson, phone,
      established_date, listed_date, par_value, paid_in_capital, private_placement_shares,
      preferred_stock_shares, financial_report_type, stock_transfer_agency, transfer_agency_phone,
      transfer_agency_address, auditing_firm, auditor1, auditor2, english_short_name, fax_number,
      email, website, issued_shares
    FROM "export"."company_profile" WHERE symbol = ${companyId} LIMIT 1
  `;
  const tpexRow = tpexRows[0];
  if (!tpexRow) return null;

  return {
    symbol: tpexRow.symbol,
    market: 'TPEx',
    reportDate: tpexRow.report_date?.toISOString().slice(0, 10) ?? null,
    name: tpexRow.name,
    shortName: tpexRow.short_name,
    foreignRegistrationCountry: tpexRow.foreign_registration_country,
    industry: tpexRow.industry,
    industryName: null, // TPEx 的 export.company_profile 沒有這個欄位，見上面 CompanyProfileDetail 的說明。
    address: tpexRow.address,
    taxId: tpexRow.tax_id,
    chairman: tpexRow.chairman,
    generalManager: tpexRow.general_manager,
    spokesperson: tpexRow.spokesperson,
    spokespersonTitle: tpexRow.spokesperson_title,
    deputySpokesperson: tpexRow.deputy_spokesperson,
    phone: tpexRow.phone,
    establishedDate: tpexRow.established_date?.toISOString().slice(0, 10) ?? null,
    listedDate: tpexRow.listed_date?.toISOString().slice(0, 10) ?? null,
    parValue: tpexRow.par_value ? Number(tpexRow.par_value) : null,
    paidInCapital: tpexRow.paid_in_capital?.toString() ?? null,
    privatePlacementShares: tpexRow.private_placement_shares?.toString() ?? null,
    preferredStockShares: tpexRow.preferred_stock_shares?.toString() ?? null,
    financialReportType: tpexRow.financial_report_type,
    financialReportTypeName: resolveFinancialReportTypeName(tpexRow.financial_report_type),
    stockTransferAgency: tpexRow.stock_transfer_agency,
    transferAgencyPhone: tpexRow.transfer_agency_phone,
    transferAgencyAddress: tpexRow.transfer_agency_address,
    auditingFirm: tpexRow.auditing_firm,
    auditor1: tpexRow.auditor1,
    auditor2: tpexRow.auditor2,
    englishShortName: tpexRow.english_short_name,
    englishAddress: null,
    faxNumber: tpexRow.fax_number,
    email: tpexRow.email,
    website: tpexRow.website,
    issuedShares: tpexRow.issued_shares?.toString() ?? null,
  };
};

// 排除 KY 股（境外註冊掛牌公司，股票簡稱以「-KY」結尾，例如「英利-KY」）——2026-09-02 應
// 使用者要求，只有 /valuation/ranking 在用，不是像上面 getTwseCompanySymbolSet 那樣給多個
// 排行/screener 共用的「排除 ETF」政策。KY 股本身是合法的上市公司、不是衍生性商品，這裡
// 排除純粹是估值排行這個情境下的使用者選擇，不代表其他功能也該跟著排除。跟
// getTwseCompanySymbolSet 一樣要篩 source，理由同上。
export const getTwseNonKyCompanySymbolSet = async (): Promise<Set<string>> => {
  const rows = await twsePrisma.companyProfile.findMany({
    where: { source: 'COMPANY_PROFILE' },
    select: { symbol: true, shortName: true },
  });
  return new Set(rows.filter((row) => !row.shortName?.includes('-KY')).map((row) => row.symbol));
};

// 給 screener/ranking 這類「多公司陣列」回應補公司名稱用（2026-09-01 新增）——只查這次結果
// 實際出現的 symbol，不是全市場，跟 GET /companies 的「一次拿全部自己快取」是不同情境：這裡
// 是結果已經算好了、對這幾十~兩百檔補顯示名稱，不需要排序全部資料，跟 sortField 排公司名稱
// 那個會撞到跨資料庫排序限制的情境不一樣。查無資料的 symbol 對應 null，不是整批失敗。
export const getCompanyNamesForSymbols = async (symbols: string[]): Promise<Map<string, string | null>> => {
  if (symbols.length === 0) return new Map();

  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.companyProfile.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, shortName: true } }),
    tpexExportPrisma.$queryRaw<RawTpexCompanyProfileRow[]>`SELECT symbol, short_name FROM "export"."company_profile" WHERE symbol = ANY(${symbols})`,
  ]);

  const result = new Map<string, string | null>();
  for (const row of twseRows) result.set(row.symbol, row.shortName);
  for (const row of tpexRows) {
    if (!result.has(row.symbol)) result.set(row.symbol, row.short_name);
  }
  return result;
};

export interface CompanyNameEntry {
  companyId: string;
  companyName: string | null;
}

// 給 GET /companies 用——2026-09-01 應 bff-ts 要求新增，讓他們可以拿全部公司代號/名稱對照表
// 自己快取。現在 screener/ranking 這類多公司陣列結果已經直接帶 companyName（見
// getCompanyNamesForSymbols），這支端點是備用管道，不是唯一的補名稱方式。涵蓋上市（TWSE）+
// 上櫃（TPEx），見兩邊 company_profile 的覆蓋範圍。
//
// 兩邊資料庫各自查全量、在應用層合併後才切頁——不是不能做到跨資料庫的 offset/limit 精確查詢，
// 是這個資料量級（總共 ~2,500 筆，每筆只有兩個字串欄位）做這件事的複雜度完全不划算，真正要
// 避免的浪費是「回應酬載」不是「資料庫查詢量」。
//
// 少數股票代號兩邊資料庫都有登記（bff-ts 2026-09-01 實測抓到 7914/7932 這兩檔），資料內容
// 一樣、只是新舊資料尚未收斂——依 symbol 去重，兩邊都有時保留 TWSE 那筆（跟 getCompanyName/
// companyExists 一律先查 TWSE 再查 TPEx 同一個優先順序），不能讓同一個 companyId 出現兩次，
// 之前沒去重害 bff-ts 那邊 upsert 撞到「ON CONFLICT DO UPDATE 同一列被影響兩次」的錯誤。
const dedupeBySymbol = (rows: { symbol: string; shortName: string | null }[]): CompanyNameEntry[] => {
  const bySymbol = new Map<string, string | null>();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row.shortName);
  }
  return [...bySymbol].map(([companyId, companyName]) => ({ companyId, companyName }));
};

export const listAllCompanyNames = async (limit: number, offset: number): Promise<{ count: number; entries: CompanyNameEntry[] }> => {
  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.companyProfile.findMany({ select: { symbol: true, shortName: true } }),
    tpexExportPrisma.$queryRaw<RawTpexCompanyProfileRow[]>`SELECT symbol, short_name FROM "export"."company_profile"`,
  ]);
  const all = dedupeBySymbol([...twseRows, ...tpexRows.map((r) => ({ symbol: r.symbol, shortName: r.short_name }))]); // twseRows 排在前面，去重時優先保留
  return { count: all.length, entries: all.slice(offset, offset + limit) };
};

export const countAllCompanyNames = async (): Promise<number> => {
  const [twseSymbols, tpexRows] = await Promise.all([
    twsePrisma.companyProfile.findMany({ select: { symbol: true } }),
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile"`,
  ]);
  return new Set([...twseSymbols.map((r) => r.symbol), ...tpexRows.map((r) => r.symbol)]).size;
};
