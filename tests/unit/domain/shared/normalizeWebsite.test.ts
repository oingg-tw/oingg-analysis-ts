import { describe, it, expect } from 'vitest';
import { normalizeWebsite } from '@/domain/shared/normalizeWebsite';

// 案例**全部**取自 twse/tpex export.company_profile 的真實值（2026-09-23 實測 2,654 筆有值：
// 2,640 筆通過、14 筆回 null）。twse-ts 查 PROD 提供了 scheme 的分布，其餘是我們自己掃出來的。
describe('normalizeWebsite', () => {
  it('去掉 scheme、尾斜線、開頭的 www.', () => {
    expect(normalizeWebsite('www.acc.com.tw')).toBe('acc.com.tw');
    expect(normalizeWebsite('http://www.ancang.com/')).toBe('ancang.com');
    expect(normalizeWebsite('www.tactc.com.tw/')).toBe('tactc.com.tw');
  });

  it('裸網域是這個欄位的常態（1,401 筆裡 657 筆），本來就是目標形狀', () => {
    expect(normalizeWebsite('www.taisun.com.tw')).toBe('taisun.com.tw');
    expect(normalizeWebsite('dachan.com')).toBe('dachan.com');
  });

  it('scheme 不分大小寫，主機名轉小寫（000532 全大寫寫法）', () => {
    expect(normalizeWebsite('HTTP://www.EASYTRADE.COM.TW')).toBe('easytrade.com.tw');
    expect(normalizeWebsite('HTTPS://WWW.Example.COM')).toBe('example.com');
  });

  it('scheme 前綴壞掉的三種寫法用同一條通則收，不是三個個案特例', () => {
    expect(normalizeWebsite('http.//www.ymsgas.com.tw')).toBe('ymsgas.com.tw'); // 1767 冒號打成句點
    expect(normalizeWebsite('http//www.tainergy.com')).toBe('tainergy.com'); // 4934 少冒號
    expect(normalizeWebsite('http：//www.syncpower.com/')).toBe('syncpower.com'); // 6545 全形冒號
    expect(normalizeWebsite('//www.cyccatv.com.tw')).toBe('cyccatv.com.tw'); // 8974 只有 // 沒有 scheme
  });

  it('分隔符後面多打的空白吃掉', () => {
    expect(normalizeWebsite('http:// www.wfe.com.tw')).toBe('wfe.com.tw'); // 6474
    expect(normalizeWebsite('https:// www.acergaming.com')).toBe('acergaming.com'); // 6908
    expect(normalizeWebsite('https://www. skydigital.com.tw')).toBe('skydigital.com.tw'); // 8459
  });

  it('夾在字母之間的空白不吃——那是漏打的點，補起來會生出看似合法但錯誤的網域', () => {
    // 2711 ceasarpark com.tw：真正的網域應該是 ceasarpark.com.tw，但我們無從得知，
    // 硬去空白會變成 ceasarparkcom.tw。寧可回 null 讓前端不顯示。
    expect(normalizeWebsite('http://www.ceasarpark com.tw')).toBeNull();
  });

  it('保留路徑——那是公司的中文站入口，砍掉會連到別的頁', () => {
    expect(normalizeWebsite('https://www.tccgroupholdings.com/tw/')).toBe('tccgroupholdings.com/tw');
    expect(normalizeWebsite('https://www.johnsonhealthtech.com/tw/zht')).toBe('johnsonhealthtech.com/tw/zht');
    expect(normalizeWebsite('https://www.carnival.com.tw/index.php?lang=tw')).toBe('carnival.com.tw/index.php?lang=tw');
  });

  it('路徑維持原本的大小寫（1717 的 /Home 轉小寫會 404）', () => {
    expect(normalizeWebsite('https://www.eternal-group.com/Home')).toBe('eternal-group.com/Home');
  });

  it('擋掉佔位字串與填錯欄的值——輸出一個壞連結比不顯示更糟', () => {
    expect(normalizeWebsite('無')).toBeNull(); // 12 筆
    expect(normalizeWebsite('yutong@ms15.hinet.net')).toBeNull(); // 2579 把 email 填進網站欄
  });

  it('null 與空白回 null，不回空字串', () => {
    expect(normalizeWebsite(null)).toBeNull();
    expect(normalizeWebsite('   ')).toBeNull();
    expect(normalizeWebsite('https://')).toBeNull();
  });
});
