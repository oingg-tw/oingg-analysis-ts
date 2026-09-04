import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import type { CompanyProfileDetail } from '@/domainApi/companies/types';

interface RawTpexCompanyProfileRow {
  symbol: string;
  short_name: string | null;
}

interface RawTwseCompanyProfileRow {
  symbol: string;
  short_name: string | null;
}

// 只查公司簡稱，給 src/shared/registerCompanyRoute.ts（單一公司端點）用——company_profile 目前只鏡像了
// symbol/name/shortName 幾個欄位（見 prisma/twseExport/schema.prisma、prisma/tpexExport/schema.prisma
// 開頭說明）。上市（TWSE）查無資料再查上櫃（TPEx），兩邊都查無資料才回傳 null，不拋錯——
// 呼叫端要把這個當作「查不到名稱」的正常情境。
//
// 2026-09-03 使用者決定 curated 中台層現階段太早，TWSE 這邊改回直接查 twseExportPrisma——跟
// TPEx 同一種模式（export schema 沒有唯一識別欄位，走 $queryRaw）。
export const getCompanyName = async (symbol: string): Promise<string | null> => {
  const twseRows = await twseExportPrisma.$queryRaw<RawTwseCompanyProfileRow[]>`
    SELECT symbol, short_name FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1
  `;
  if (twseRows[0]) return twseRows[0].short_name;

  const tpexRows = await tpexExportPrisma.$queryRaw<RawTpexCompanyProfileRow[]>`
    SELECT symbol, short_name FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1
  `;
  return tpexRows[0]?.short_name ?? null;
};

// GET /stocks/:symbol/quote 用——判斷這家公司到底存不存在（上市或上櫃任一邊有登記），
// 不存在才回 404；存在但查無股價/估值資料是另一回事（回 200，欄位是 null）。
export const companyExists = async (symbol: string): Promise<boolean> => {
  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1`,
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1`,
  ]);
  return twseRows.length > 0 || tpexRows.length > 0;
};

export interface SecuritySymbolsFilter {
  market?: 'TWSE' | 'TPEx'; // 不給就兩個市場都要
  includeEmerging?: boolean; // 預設 true——興櫃算真正公司，見 getAllSecurityRows 的說明
  excludeKy?: boolean; // 預設 false——KY 股是合法上市公司，不是衍生商品，預設不排除
  preferredStock?: 'only' | 'exclude'; // 不給就兩種都要（股票+特別股混在一起）
  // 2026-09-04 資料到位後接上——TWSE/TPEx 的「全額交割股」判斷方式不一樣（見
  // getFullDeliverySymbolSets 的說明），這裡統一成單一參數，呼叫端不用管兩邊實作細節。
  excludeFullDelivery?: boolean;
}

interface RawSecurityRow {
  symbol: string;
  market: 'TWSE' | 'TPEx';
  shortName: string | null;
  isEmerging: boolean;
  isPreferredStock: boolean;
  isFullDelivery: boolean;
}

// 給 GET /securities/symbols 用（2026-09-02 應使用者要求，原本是 GET /companies/symbols，
// 搬過來是因為「能不能交易」本質上是證券層級的判斷，不是公司層級的——「公司」（company_profile
// 的完整登記範疇，含臺銀證券這種非交易性質登記）跟「證券」（真正能交易的上市櫃標的）是兩個
// 不同概念，不該共用同一支端點）。
//
// mops-ts 之前請我們手動貼一份「真正公司代號清單」給他們做 capital_stock_history 全市場回補，
// 貼靜態清單容易過時/貼錯（已經發生過一次：第一版漏算興櫃），改成端點讓他們自己即時打。
//
// 2026-09-02 使用者要求把這支端點做成「通用證券代號查詢」（不是只服務 mops-ts 那個特定情境），
// 需要真的能選「只要特別股」或「排除特別股」，不是原本以為的「company_profile 本來就不含
// 特別股，這個參數沒有意義」——company_profile 確實不含特別股，但這不代表這支端點的資料源
// 只能是 company_profile。改成額外 UNION 進 twse-ts 的 export.isin_securities
// （security_type='特別股'）取得特別股清單，company_profile 負責一般股票（+KY/興櫃判斷），
// isin_securities 負責特別股這個子集——兩者是互補關係，不是取代關係。
//
// 已知限制：isin_securities 目前只有 TWSE（market_type 只有「上市」「上市臺灣創新板」，
// 2026-09-02 實測 1,384 筆裡沒有任何上櫃資料），TPEx 特別股目前查不到，`market=TPEx` +
// `preferredStock=only` 這個組合現在一定回空陣列，不是 bug。
//
// 2026-09-02 這幾個查詢改成依 filter 決定要不要打——這支函式現在被 revenueRanking/
// priceChangeRanking/valuation-ranking 等 6 支排行/指標透過 getSecuritySymbolSet 呼叫，
// 每支都傳 preferredStock: 'exclude'（維持它們原本的行為，不需要特別股資料），如果每次都
// 無條件查 isin_securities 再篩掉，等於每次排行請求都多打一次 twse-ts 那張手動同步、沒掛
// Cloud Scheduler 的表（twse-ts 原話：記憶體考量才手動同步），白白增加負擔卻用不到結果。
// 同理 market 篩單一市場時，不用查另一邊的 company_profile。
// 全額交割股——TWSE/TPEx 兩邊的判斷方式不一樣，2026-09-04 分別跟 twse-ts/tpex-ts 確認過：
// - TWSE：export.changed_trading_method 裡「這檔股票有沒有出現在最新一個 trade_date」才是
//   判斷依據，不是看 periodic_call_auction_trading 這個欄位值（那是「分盤集合競價」，另一種
//   措施，這張表本來就同時記錄好幾種變更交易方法，不是只有全額交割）。
// - TPEx：changed_trading_method 有獨立的 altered_trading 布林欄位，直接代表全額交割，跟
//   periodic_trading（分盤集合競價）是兩個分開的欄位，不會混淆。
// 兩邊都用「當下最新 trade_date」判斷，因為全額交割狀態會隨時間變動（公司恢復正常交易就會
// 移出這張表/欄位變 false），不是一次判斷永久有效。
const getFullDeliverySymbolSets = async (): Promise<{ twse: Set<string>; tpex: Set<string> }> => {
  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<{ symbol: string }[]>`
      SELECT DISTINCT symbol FROM "export"."changed_trading_method"
      WHERE trade_date = (SELECT MAX(trade_date) FROM "export"."changed_trading_method")
    `,
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`
      SELECT DISTINCT symbol FROM "export"."changed_trading_method"
      WHERE trade_date = (SELECT MAX(trade_date) FROM "export"."changed_trading_method") AND altered_trading = true
    `,
  ]);
  return { twse: new Set(twseRows.map((r) => r.symbol)), tpex: new Set(tpexRows.map((r) => r.symbol)) };
};

const getAllSecurityRows = async (filter: SecuritySymbolsFilter): Promise<RawSecurityRow[]> => {
  const needsTwse = filter.market !== 'TPEx';
  const needsTpex = filter.market !== 'TWSE';
  const needsPreferred = filter.preferredStock !== 'exclude' && filter.market !== 'TPEx'; // isin_securities 目前只有 TWSE。
  const needsFullDelivery = filter.excludeFullDelivery === true;

  const [twseRows, tpexRows, twsePreferredRows, fullDeliverySets] = await Promise.all([
    needsTwse
      ? twseExportPrisma.$queryRaw<{ symbol: string; short_name: string | null }[]>`
          SELECT symbol, short_name FROM "export"."company_profile" WHERE source = 'COMPANY_PROFILE'
        `
      : Promise.resolve([]),
    needsTpex
      ? tpexExportPrisma.$queryRaw<{ symbol: string; short_name: string | null; source: string | null }[]>`
          SELECT symbol, short_name, source FROM "export"."company_profile"
        `
      : Promise.resolve([]),
    needsPreferred
      ? twseExportPrisma.$queryRaw<{ symbol: string; name: string | null }[]>`
          SELECT symbol, name FROM "export"."isin_securities" WHERE security_type = '特別股'
        `
      : Promise.resolve([]),
    needsFullDelivery ? getFullDeliverySymbolSets() : Promise.resolve({ twse: new Set<string>(), tpex: new Set<string>() }),
  ]);
  return [
    ...twseRows.map((row) => ({ symbol: row.symbol, market: 'TWSE' as const, shortName: row.short_name, isEmerging: false, isPreferredStock: false, isFullDelivery: fullDeliverySets.twse.has(row.symbol) })),
    ...tpexRows.map((row) => ({
      symbol: row.symbol,
      market: 'TPEx' as const,
      shortName: row.short_name,
      isEmerging: row.source === 'COMPANY_PROFILE_EMERGING',
      isPreferredStock: false,
      isFullDelivery: fullDeliverySets.tpex.has(row.symbol),
    })),
    // isin_securities 沒有 shortName/KY 判斷用得到的欄位，用 name 頂替——特別股的名稱是跟著
    // 母公司走的（例如「台泥乙特」），如果母公司是 KY 股，名稱理論上也會帶 -KY，沒有實測過
    // 反例，先用同一套判斷邏輯，之後發現不準再調整。全額交割同理，特別股不在
    // changed_trading_method 裡出現過，固定當作不是全額交割，沒有實測過反例。
    ...twsePreferredRows.map((row) => ({ symbol: row.symbol, market: 'TWSE' as const, shortName: row.name, isEmerging: false, isPreferredStock: true, isFullDelivery: false })),
  ];
};

export const getSecuritySymbols = async (filter: SecuritySymbolsFilter): Promise<string[]> => {
  const rows = await getAllSecurityRows(filter);
  const filtered = rows.filter((row) => {
    if (filter.market && row.market !== filter.market) return false;
    if (filter.includeEmerging === false && row.isEmerging) return false;
    if (filter.excludeKy && row.shortName?.includes('-KY')) return false;
    if (filter.preferredStock === 'only' && !row.isPreferredStock) return false;
    if (filter.preferredStock === 'exclude' && row.isPreferredStock) return false;
    if (filter.excludeFullDelivery && row.isFullDelivery) return false;
    return true;
  });
  return [...new Set(filtered.map((row) => row.symbol))].sort();
};

// 2026-09-02 應使用者要求整併——之前 getTwseCompanySymbolSet/getTpexCompanySymbolSet/
// getTwseNonKyCompanySymbolSet 是跟 getSecuritySymbols 平行的另一套「誰算真正證券」邏輯，
// 只回傳單一市場、不支援篩選參數，給 revenueRanking/priceChangeRanking/foreignHoldingRanking/
// marginShortRatioRanking/valuation-ranking/indicatorRegistry 這幾支排行/指標用。改成這個
// 薄包裝，讓那些呼叫端也走 getSecuritySymbols 同一套邏輯，不用維護兩份幾乎一樣的查詢。
export const getSecuritySymbolSet = async (filter: SecuritySymbolsFilter): Promise<Set<string>> => {
  return new Set(await getSecuritySymbols(filter));
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

interface RawTwseCompanyProfileDetailRow {
  symbol: string;
  report_date: Date;
  name: string | null;
  short_name: string | null;
  foreign_registration_country: string | null;
  industry: string | null;
  industry_name: string | null;
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
  english_address: string | null;
  fax_number: string | null;
  email: string | null;
  website: string | null;
  issued_shares: bigint | null;
}

const TWSE_COMPANY_PROFILE_DETAIL_COLUMNS = `symbol, report_date, name, short_name, foreign_registration_country, industry,
  industry_name, address, tax_id, chairman, general_manager, spokesperson, spokesperson_title, deputy_spokesperson,
  phone, established_date, listed_date, par_value, paid_in_capital, private_placement_shares, preferred_stock_shares,
  financial_report_type, stock_transfer_agency, transfer_agency_phone, transfer_agency_address, auditing_firm,
  auditor1, auditor2, english_short_name, english_address, fax_number, email, website, issued_shares`;

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
// 不是「排除幽靈代號」那種清單情境（見 getAllSecurityRows 的說明），就算是
// COMPANY_PROFILE_PUBLIC 這類非交易性質的登記資料，指名查询時一樣照實回傳。
export const getCompanyProfileDetail = async (symbol: string): Promise<CompanyProfileDetail | null> => {
  const twseRows = await twseExportPrisma.$queryRawUnsafe<RawTwseCompanyProfileDetailRow[]>(
    `SELECT ${TWSE_COMPANY_PROFILE_DETAIL_COLUMNS} FROM "export"."company_profile" WHERE symbol = $1 LIMIT 1`,
    symbol
  );
  const twseRow = twseRows[0];
  if (twseRow) {
    return {
      symbol: twseRow.symbol,
      market: 'TWSE',
      reportDate: twseRow.report_date.toISOString().slice(0, 10),
      name: twseRow.name,
      shortName: twseRow.short_name,
      foreignRegistrationCountry: twseRow.foreign_registration_country,
      industry: twseRow.industry,
      industryName: resolveIndustryName(twseRow.industry, twseRow.industry_name),
      address: twseRow.address,
      taxId: twseRow.tax_id,
      chairman: twseRow.chairman,
      generalManager: twseRow.general_manager,
      spokesperson: twseRow.spokesperson,
      spokespersonTitle: twseRow.spokesperson_title,
      deputySpokesperson: twseRow.deputy_spokesperson,
      phone: twseRow.phone,
      establishedDate: twseRow.established_date?.toISOString().slice(0, 10) ?? null,
      listedDate: twseRow.listed_date?.toISOString().slice(0, 10) ?? null,
      parValue: twseRow.par_value ? Number(twseRow.par_value) : null,
      paidInCapital: twseRow.paid_in_capital?.toString() ?? null,
      privatePlacementShares: twseRow.private_placement_shares?.toString() ?? null,
      preferredStockShares: twseRow.preferred_stock_shares?.toString() ?? null,
      financialReportType: twseRow.financial_report_type,
      financialReportTypeName: resolveFinancialReportTypeName(twseRow.financial_report_type),
      stockTransferAgency: twseRow.stock_transfer_agency,
      transferAgencyPhone: twseRow.transfer_agency_phone,
      transferAgencyAddress: twseRow.transfer_agency_address,
      auditingFirm: twseRow.auditing_firm,
      auditor1: twseRow.auditor1,
      auditor2: twseRow.auditor2,
      englishShortName: twseRow.english_short_name,
      englishAddress: twseRow.english_address,
      faxNumber: twseRow.fax_number,
      email: twseRow.email,
      website: twseRow.website,
      issuedShares: twseRow.issued_shares?.toString() ?? null,
    };
  }

  const tpexRows = await tpexExportPrisma.$queryRaw<RawTpexCompanyProfileDetailRow[]>`
    SELECT symbol, report_date, name, short_name, foreign_registration_country, industry, address, tax_id,
      chairman, general_manager, spokesperson, spokesperson_title, deputy_spokesperson, phone,
      established_date, listed_date, par_value, paid_in_capital, private_placement_shares,
      preferred_stock_shares, financial_report_type, stock_transfer_agency, transfer_agency_phone,
      transfer_agency_address, auditing_firm, auditor1, auditor2, english_short_name, fax_number,
      email, website, issued_shares
    FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1
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

// 給 screener/ranking 這類「多公司陣列」回應補公司名稱用（2026-09-01 新增）——只查這次結果
// 實際出現的 symbol，不是全市場，跟 GET /companies 的「一次拿全部自己快取」是不同情境：這裡
// 是結果已經算好了、對這幾十~兩百檔補顯示名稱，不需要排序全部資料，跟 sortField 排公司名稱
// 那個會撞到跨資料庫排序限制的情境不一樣。查無資料的 symbol 對應 null，不是整批失敗。
export const getCompanyNamesForSymbols = async (symbols: string[]): Promise<Map<string, string | null>> => {
  if (symbols.length === 0) return new Map();

  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<RawTwseCompanyProfileRow[]>`SELECT symbol, short_name FROM "export"."company_profile" WHERE symbol = ANY(${symbols})`,
    tpexExportPrisma.$queryRaw<RawTpexCompanyProfileRow[]>`SELECT symbol, short_name FROM "export"."company_profile" WHERE symbol = ANY(${symbols})`,
  ]);

  const result = new Map<string, string | null>();
  for (const row of twseRows) result.set(row.symbol, row.short_name);
  for (const row of tpexRows) {
    if (!result.has(row.symbol)) result.set(row.symbol, row.short_name);
  }
  return result;
};

export interface CompanyNameEntry {
  symbol: string;
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
// companyExists 一律先查 TWSE 再查 TPEx 同一個優先順序），不能讓同一個 symbol 出現兩次，
// 之前沒去重害 bff-ts 那邊 upsert 撞到「ON CONFLICT DO UPDATE 同一列被影響兩次」的錯誤。
const dedupeBySymbol = (rows: { symbol: string; shortName: string | null }[]): CompanyNameEntry[] => {
  const bySymbol = new Map<string, string | null>();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row.shortName);
  }
  return [...bySymbol].map(([symbol, companyName]) => ({ symbol, companyName }));
};

export const listAllCompanyNames = async (limit: number, offset: number): Promise<{ count: number; entries: CompanyNameEntry[] }> => {
  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<RawTwseCompanyProfileRow[]>`SELECT symbol, short_name FROM "export"."company_profile"`,
    tpexExportPrisma.$queryRaw<RawTpexCompanyProfileRow[]>`SELECT symbol, short_name FROM "export"."company_profile"`,
  ]);
  const all = dedupeBySymbol([
    ...twseRows.map((r) => ({ symbol: r.symbol, shortName: r.short_name })),
    ...tpexRows.map((r) => ({ symbol: r.symbol, shortName: r.short_name })),
  ]); // twseRows 排在前面，去重時優先保留
  return { count: all.length, entries: all.slice(offset, offset + limit) };
};

export const countAllCompanyNames = async (): Promise<number> => {
  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile"`,
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile"`,
  ]);
  return new Set([...twseRows.map((r) => r.symbol), ...tpexRows.map((r) => r.symbol)]).size;
};
