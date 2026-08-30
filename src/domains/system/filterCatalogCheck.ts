import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { filterCatalog, type FilterCategory } from './filterCatalog';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const analysisSchemaPath = join(__dirname, '../../../prisma/analysis/schema.prisma');

// 判斷規則跟 prisma/analysis/schema.prisma 開頭的表名命名規則註解對應：
// - model 名稱去掉 `Result` 字尾、字首小寫，就是 filterCatalog.ts 裡的 metric key
//   （例如 model RoeResult -> metric key "roe"，跟資料夾 src/domains/profitability/roe/ 對應）。
// - 「可以拿來 filter 的計算結果欄位」= 型別是 Decimal、欄位名稱不是以 Value 結尾的欄位。
//   `*Value`（例如 netIncomeValue）、`*FieldUsed`、`*EffectiveYear`/`*EffectiveMonth` 這些是
//   原始輸入/中繼欄位，不是計算出來的指標本身，即使型別剛好也是 Decimal（例如
//   GrahamNumberResult.epsTtmValue/bvpsValue，是引用自 eps/bvps 服務的中繼值），也不算。
const deriveMetricKey = (modelName: string): string => {
  const withoutSuffix = modelName.endsWith('Result') ? modelName.slice(0, -'Result'.length) : modelName;
  return withoutSuffix.charAt(0).toLowerCase() + withoutSuffix.slice(1);
};

const parseAnalysisSchemaFilterableFields = (schemaText: string): Map<string, { modelName: string; fields: Set<string> }> => {
  const byMetricKey = new Map<string, { modelName: string; fields: Set<string> }>();
  const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
  const fieldLineRegex = /^(\w+)\s+(\w+)(\[\])?\??/;

  let modelMatch: RegExpExecArray | null;
  while ((modelMatch = modelRegex.exec(schemaText)) !== null) {
    // modelName/body 兩個 capture group 在 modelRegex 裡都是必填（沒有 `?`），match 成功就一定有值。
    const modelName = modelMatch[1]!;
    const body = modelMatch[2]!;
    const fields = new Set<string>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const fieldMatch = line.match(fieldLineRegex);
      if (!fieldMatch) continue;
      // fieldName/fieldType 同理，是必填 capture group。
      const fieldName = fieldMatch[1]!;
      const fieldType = fieldMatch[2]!;
      if (fieldType === 'Decimal' && !fieldName.endsWith('Value')) {
        fields.add(fieldName);
      }
    }
    byMetricKey.set(deriveMetricKey(modelName), { modelName, fields });
  }
  return byMetricKey;
};

/**
 * 純比對邏輯，拆出來獨立匯出方便測試（見 tests/system/filterCatalogCheck.test.ts）——
 * 不碰檔案系統，catalog/schemaText 都是參數，測試可以直接餵假資料，不用真的改
 * filterCatalog.ts 或 schema.prisma 來製造「不一致」的情境。
 *
 * 兩個方向都會抓：
 * 1. catalog 列了但 schemaText 裡已經沒有的 metric/欄位（指標被移除、欄位改名、key 打錯）。
 * 2. schemaText 有、但 catalog 忘記加的 metric/欄位（新增指標或欄位後忘記同步）。
 *
 * 2026-08-30：一個 model 可能被拆成多個 filterCatalog 顯示分組（例如 turnoverRatio 拆成
 * 「存貨周轉率」「應收帳款周轉率」...9 組，都對應同一個 TurnoverRatioResult），所以第 2 點
 * 「這個 model 的欄位有沒有全部被 catalog 蓋到」要先用 modelKey 把同一個 model 底下的多個
 * 顯示分組聚合起來看聯集，不能只看單一 metric 自己的 fields。
 */
export const findFilterCatalogProblems = (catalog: FilterCategory[], schemaText: string): string[] => {
  const dbMetrics = parseAnalysisSchemaFilterableFields(schemaText);

  const modelKeysSeen = new Set<string>();
  const fieldKeysSeenPerModel = new Map<string, Set<string>>();
  const problems: string[] = [];

  for (const category of catalog) {
    for (const metric of category.metrics) {
      const modelKey = metric.modelKey ?? metric.key;
      modelKeysSeen.add(modelKey);
      const dbMetric = dbMetrics.get(modelKey);
      if (!dbMetric) {
        problems.push(
          `filterCatalog.ts 的 ${category.key}.${metric.key}（modelKey: "${modelKey}"）在 prisma/analysis/schema.prisma 找不到對應的 model（預期 model 名稱：<PascalCase modelKey>Result）——指標被移除了，或 key/modelKey 打錯。`,
        );
        continue;
      }
      for (const field of metric.fields) {
        if (!dbMetric.fields.has(field.key)) {
          problems.push(
            `filterCatalog.ts 的 ${category.key}.${metric.key}.${field.key} 在 ${dbMetric.modelName}（schema.prisma）裡找不到對應的 Decimal 欄位——欄位被改名/移除了，或打錯。`,
          );
        }
      }
      let seen = fieldKeysSeenPerModel.get(modelKey);
      if (!seen) {
        seen = new Set();
        fieldKeysSeenPerModel.set(modelKey, seen);
      }
      metric.fields.forEach((f) => seen!.add(f.key));
    }
  }

  for (const [metricKey, dbMetric] of dbMetrics) {
    if (dbMetric.fields.size === 0) continue;
    if (!modelKeysSeen.has(metricKey)) {
      problems.push(
        `schema.prisma 有 ${dbMetric.modelName}（推導出的 metric key："${metricKey}"），但 filterCatalog.ts 完全沒有列這個指標——新指標忘記加進 filterCatalog.ts 了嗎？`,
      );
      continue;
    }
    const seenFieldKeys = fieldKeysSeenPerModel.get(metricKey) ?? new Set<string>();
    for (const dbFieldKey of dbMetric.fields) {
      if (!seenFieldKeys.has(dbFieldKey)) {
        problems.push(
          `${dbMetric.modelName}（schema.prisma）新增了 Decimal 欄位 ${dbFieldKey}，但 filterCatalog.ts 底下所有 modelKey 為 "${metricKey}" 的顯示分組都沒有列——新欄位忘記加進 filterCatalog.ts 了嗎？`,
        );
      }
    }
  }

  return problems;
};

/**
 * 伺服器啟動時自我檢測：filterCatalog.ts 列的分類/指標/欄位，是否跟
 * prisma/analysis/schema.prisma 目前定義的表/欄位一致。
 *
 * 直接讀 schema.prisma 原始檔（不是查活的資料庫，也不是用 Prisma DMMF），因為 schema.prisma
 * 本身就是這個服務對 analysis DB 的 schema 唯一真相來源——照專案慣例，改 model 一定要接著跑
 * `pnpm prisma:analysis:migrate`，schema.prisma 才會落地成真的表/欄位，所以 schema.prisma
 * 有沒有同步更新，就等於資料庫有沒有同步更新。
 *
 * 開發環境（非 production）發現不一致就直接 throw，讓問題在啟動當下就爆出來，不要等前端來問
 * 為什麼 filter 清單缺東西；production 只記錄錯誤 log，不因為這種 metadata 落差讓整個服務掛掉。
 */
export const checkFilterCatalogConsistency = (isProduction: boolean): void => {
  const schemaText = readFileSync(analysisSchemaPath, 'utf-8');
  const problems = findFilterCatalogProblems(filterCatalog, schemaText);

  if (problems.length === 0) {
    console.log('[filter-catalog-check]: filterCatalog.ts 跟 prisma/analysis/schema.prisma 一致。');
    return;
  }

  console.error(`[filter-catalog-check]: filterCatalog.ts 跟 prisma/analysis/schema.prisma 不一致，共 ${problems.length} 個問題：`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }

  if (!isProduction) {
    throw new Error(
      `filterCatalog.ts 跟 prisma/analysis/schema.prisma 不一致（${problems.length} 個問題，詳見上方 log）。請同步更新 src/domains/system/filterCatalog.ts 後再啟動。`,
    );
  }
};
