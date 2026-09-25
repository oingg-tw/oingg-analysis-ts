import { describe, expect, test } from 'vitest';
import { shape } from './shape';

// 2026-09-25：shape() 是所有 golden 的判準，它自己壞掉的話 61 支 golden 會一起變成假綠燈或假紅燈。
// 這支測試釘兩件事：(1) 修掉的那個假警報真的消失了；(2) 該紅的情況仍然會紅。
// 第 (2) 組跟第 (1) 組一樣重要——只證明「不再亂叫」的守衛，可能其實是什麼都不叫了。

describe('shape：清單合併所有元素，而且 null 讓位給有值的那邊', () => {
  test('原本的假警報：第一筆是 null 或有值，結果都一樣', () => {
    // 注意股清單每天換，第一檔的 observationDays 有時 null 有時有值——改之前這兩個會得到不同結果
    const todayFirstIsNull = shape([{ observationDays: null }, { observationDays: 5 }]);
    const tomorrowFirstHasValue = shape([{ observationDays: 5 }, { observationDays: null }]);
    expect(todayFirstIsNull).toEqual(tomorrowFirstHasValue);
    expect(todayFirstIsNull).toEqual([{ observationDays: '<number>' }]);
  });

  test('整欄都是 null 才記成 null', () => {
    expect(shape([{ a: null }, { a: null }])).toEqual([{ a: '<null>' }]);
  });

  test('合併要走到巢狀物件裡', () => {
    expect(shape([{ o: { x: null } }, { o: { x: 1 } }])).toEqual([{ o: { x: '<number>' } }]);
  });
});

describe('shape：該紅的仍然要紅', () => {
  test('整個清單換型別（數字變字串）要看得到', () => {
    expect(shape([{ a: 1 }, { a: 2 }])).not.toEqual(shape([{ a: '中文' }, { a: '名稱' }]));
  });

  test('除了空 vs 有值之外，元素之間的差異不取聯集（維持第一筆）', () => {
    // 取聯集會把資料（ISIN、英文公司名、指標目錄）變成 golden 內容，每換一筆資料就翻——試過、是錯的
    expect(shape([{ code: 'TW0001101B05' }, { code: 'TW0001312A01' }])).toEqual([{ code: 'TW0001101B05' }]);
    expect(shape([{ market: 'TWSE' }, { market: 'TPEx' }])).toEqual([{ market: 'TWSE' }]);
  });

  test('某些元素少了一個選填欄位：有的那邊為準（跟 null 同理）', () => {
    expect(shape([{ a: 1 }, { a: 1, warning: '中文警語' }])).toEqual([{ a: '<number>', warning: '<string>' }]);
  });

  test('欄位被拿掉：跟原本的形狀不同', () => {
    expect(shape([{ a: 1, b: 2 }])).not.toEqual(shape([{ a: 1 }]));
  });

  test('多了一個欄位：跟原本的形狀不同', () => {
    expect(shape([{ a: 1 }])).not.toEqual(shape([{ a: 1, c: 3 }]));
  });

  test('空清單跟非空清單仍然區分', () => {
    expect(shape([])).toEqual([]);
    expect(shape([{ a: 1 }])).not.toEqual(shape([]));
  });

  test('enum 式的短識別字照原樣保留（bff-ts 對這類值有嚴格校驗）', () => {
    expect(shape({ timeframe: 'roe.TTM' })).toEqual({ timeframe: 'roe.TTM' });
  });
});
