import { filterCatalog, type FilterCategory } from './filterCatalog';
import { logger } from '@/shared/logger';

// 產品內建的策展預設 view——2026-09-01 應使用者要求新增，跟使用者自己客製化的欄位選擇
// （那種純粹是前端/bff-ts 的個人 UI 偏好狀態，不需要 analysis-ts 參與）不同：這裡是產品設計好、
// 固定的組合，給一個名字、給使用者「一鍵套用」用，不是使用者自己勾選出來的。
//
// `fieldKeys` 用 `"metricKey.fieldKey"` 格式（跟 bff-ts 既有慣例一致，2026-09-01 bff-ts
// 回報改用這個格式），不能只寫裸的 field key——filterCatalog.ts 裡有些 field key 同時存在於
// 兩個不同 metric 底下（例如 `netProfitMarginQuarterly` 同時是 `netProfitMargin` 跟 `dupont`
// 的欄位，`assetTurnoverQuarterly` 同時是 `assetTurnoverRatio` 跟 `dupont` 的欄位，兩邊定義
// 完全一樣但屬於不同 metric），裸 key 會造成前端解析歧義，一開始的 profitabilityQuality 就踩到
// 這個問題。前端拿到 `"metricKey.fieldKey"` 後去 filterCatalog 對應 metric 底下找出這個 field
// 的完整定義（name/unit/period 等）即可，不需要在這裡重複描述一次。
//
// 2026-09-08：bff-ts 實測抓到這份清單長期沒有跟著 filterCatalog.csv 的退場批次同步更新
// （roe.roeTtmPct/debtRatio.debtRatioPct 早在 2026-09-07 那批退場就已經失效，這份清單
// 沒人記得回來改），導致他們自己同步的「總覽」預設組合帶著查無此欄位的欄位、驗證失敗讓
// 整個 POST /screener 請求被打回票——bff-ts 已經在他們那端修好防禦（欄位對不上就丟掉單一
// 欄位，不是整個請求失敗），但問題根源在我們這裡：這份清單一直是「純手動維護、沒有一致性
// 檢查」的狀態，跟 filterCatalog.ts 本身有 filterCatalogCheck.ts 守著形成對比。
//
// filterCatalog.csv 這次（beta/marketRatios 最後 6 列）退場後已經清空到只剩 header——
// 也就是說目前沒有任何真正可查詢的欄位存在，這份清單裡原本 7 組預設引用的欄位（roe/
// debtRatio/ncav/grahamNumber/altmanZScore/...等）沒有一個還有效，全部清空，不留殘留
// 引用誤導消費端。新增 findColumnPresetProblems 一致性檢查（跟 filterCatalogCheck.ts
// 同一套精神，見 src/index.ts 啟動時呼叫），之後 filterCatalog 重新有欄位、這裡要加回
// 預設組合時，忘記同步會在啟動當下直接爆出來，不會再悄悄漂移。
export interface ColumnPreset {
  key: string;
  name: string;
  description: string;
  fieldKeys: string[]; // 格式："metricKey.fieldKey"
  // 選填，只有一組會是 true——使用者選擇之前，前端應該顯示的初始欄位組合。2026-09-01 使用者
  // 定調：不要直接拿六組策略性預設（存股/價值/成長/技術面…）其中一組硬當預設，因為那些各自
  // 偏向特定投資風格，隨便選一組當所有使用者的起始畫面會有偏向性；改用下面新增的中性
  // `overview`，只放大多數人都會想先看的通用欄位，不偏向任何一種策略。
  isDefault?: boolean;
}

export const columnPresets: ColumnPreset[] = [];

/**
 * 純比對邏輯，拆出來獨立匯出方便測試（見 tests/domains/filter/columnPresets.test.ts）——
 * 檢查每個 preset 的每個 fieldKey（"metricKey.fieldKey"）都能在 filterCatalog 裡找到對應
 * 欄位，抓「欄位被 filterCatalog 退場但 columnPresets 忘記同步」這種漂移。
 */
export const findColumnPresetProblems = (presets: ColumnPreset[], catalog: FilterCategory[]): string[] => {
  const validFieldKeys = new Set<string>();
  for (const category of catalog) {
    for (const metric of category.metrics) {
      for (const field of metric.fields) {
        validFieldKeys.add(`${metric.key}.${field.key}`);
      }
    }
  }

  const problems: string[] = [];
  for (const preset of presets) {
    for (const fieldKey of preset.fieldKeys) {
      if (!validFieldKeys.has(fieldKey)) {
        problems.push(`columnPresets.ts 的 "${preset.key}" 引用了 "${fieldKey}"，但這個欄位不在 filterCatalog.ts 裡——欄位被退場了，或打錯了。`);
      }
    }
  }
  return problems;
};

/**
 * 伺服器啟動時自我檢測：columnPresets.ts 的每個 fieldKey 是否還在 filterCatalog.ts 裡——
 * 跟 filterCatalogCheck.ts 的 checkFilterCatalogConsistency 同一個時機、同一種容錯原則
 * （開發環境發現不一致直接 throw，production 只記錄錯誤 log，不讓服務掛掉），見
 * src/index.ts 的呼叫。
 */
export const checkColumnPresetsConsistency = (isProduction: boolean): void => {
  const problems = findColumnPresetProblems(columnPresets, filterCatalog);

  if (problems.length === 0) {
    logger.info('[column-presets-check]: columnPresets.ts 的每個欄位都能在 filterCatalog.ts 裡找到。');
    return;
  }

  logger.error(`[column-presets-check]: columnPresets.ts 跟 filterCatalog.ts 不一致，共 ${problems.length} 個問題：`);
  for (const problem of problems) {
    logger.error(`  - ${problem}`);
  }

  if (!isProduction) {
    throw new Error(`columnPresets.ts 跟 filterCatalog.ts 不一致（${problems.length} 個問題，詳見上方 log）。請同步更新 src/api/bff/filter/columnPresets.ts 後再啟動。`);
  }
};
