// 交易所 company_profile 的 website 欄位正規化——這個欄位混雜至少五種寫法：
// "www.acc.com.tw" 純網域、"http://www.ancang.com/" 含 scheme+尾斜線、"www.tactc.com.tw/" 尾斜線無 scheme、
// "HTTP://www.EASYTRADE.COM.TW"（000532）全大寫 scheme、"https://www.tccgroupholdings.com/tw/"（1101）帶路徑。
// 這是資料源頭本身的格式不一致，不該讓每個消費端各自防禦性清洗，統一在資料離開本服務之前處理一次。
//
// 2026-09-04 建立（原本在 infrastructure/repositories/exchange/companyProfile.ts 內），
// 2026-09-23 搬來 domain 並補測試 + 兩處修正：
//   1. scheme 與 www. 改成**不分大小寫**——原本 /^https?:\/\// 比不到全大寫的 "HTTP://"，整串原樣輸出、當連結會壞。
//      順帶把**主機名**轉小寫（主機名不分大小寫），但**路徑保持原樣**——路徑分大小寫，1717 的 "/Home"
//      轉成 "/home" 會 404。
//   2. 刻意**不去掉路徑**。全市場 1,399 個有值的網址裡 77 個帶路徑（1101 台泥 /tw、1307 三芳 /zh、
//      1736 喬山 /tw/zht…），那是公司自己的中文站入口，砍掉會連到英文站或空白頁。這個欄位的定義因此是
//      「可直接連的網址（去掉 scheme）」而不是嚴格的裸網域；需要純主機名的呼叫端自己取第一個 '/' 之前那段。
//      （原本要求裸網域的是已取消的 logo 功能——2026-09-23 整個拿掉，見 web-nuxt 那邊的結案。）
// 已知未處理：1767 來源打成 "http.//www.ymsgas.com.tw"（冒號寫成句點），上游單一筆錯字，不為了一筆加特例；
//   要修該回報給 twse-ts 改資料。
// scheme 前綴的五種寫法一條通則收掉（2026-09-23 twse-ts 查 PROD 給的分布）：`http://`、`HTTP://` 全大寫、
// `http.//` 冒號打成句點（1767）、`http//` 少冒號（4934）、`http：//` 全形冒號（6545）。後三種是同一個類別
// ——scheme 前綴壞掉——所以用一條規則，不是三個個案特例。沒有 scheme 的裸網域（1,401 筆裡 657 筆，
// 是這個欄位的常態）本來就是目標形狀，不需要處理。
// scheme 本身可有可無——8974 是 `//www.cyccatv.com.tw`（protocol-relative，只有 `//` 沒有 scheme）。
const SCHEME_PREFIX = /^(https?[:：.]?)?\/\//i;

// 分隔符後面的空白吃掉——5 筆是 `http:// www.wfe.com.tw` 或 `https://www. skydigital.com.tw` 這種
// scheme 或點後面多打一個空格。**刻意只吃緊跟在 `/` 或 `.` 後面的空白**：2711 是
// `http://www.ceasarpark com.tw`，那個空格夾在兩個字母之間（應該是漏打的點），無腦去空白會產生
// `ceasarparkcom.tw` 這個**看起來合法但錯誤**的網域——寧可讓它被下面的長相檢查擋掉回 null。
const SPACE_AFTER_SEPARATOR = /([./])\s+/g;

// 主機名長相檢查：至少一個點、只由網域合法字元組成。用來擋掉佔位字串——twse `company_profile` 有 14 筆
// 「無」這類值，原本會被當成網址原樣輸出，下游補上 https:// 就變成一個壞連結。這是信任邊界的驗證，
// 不是美化：寧可回 null（前端本來就會「沒有就不顯示」），不要輸出一個看起來像網址的東西。
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export const normalizeWebsite = (website: string | null): string | null => {
  if (website === null) return null;
  const normalized = website
    .trim()
    .replace(SPACE_AFTER_SEPARATOR, '$1')
    .replace(SCHEME_PREFIX, '')
    .replace(/\/+$/, '')
    .replace(/^www\./i, '');
  if (normalized.length === 0) return null;

  const slash = normalized.indexOf('/');
  const host = slash === -1 ? normalized : normalized.slice(0, slash);
  if (!HOSTNAME.test(host)) return null;

  return slash === -1 ? host.toLowerCase() : host.toLowerCase() + normalized.slice(slash);
};
