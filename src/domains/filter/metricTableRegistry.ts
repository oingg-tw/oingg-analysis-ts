import { readFileSync } from 'fs';
import { join } from 'path';
import { filterCatalog, type FilterMetric } from './filterCatalog';
import { parseAnalysisSchemaModels, type ModelIntrospection } from './schemaIntrospection';

// 用 process.cwd() 而不是 import.meta.url + __dirname，理由跟 filterCatalogCheck.ts 同一段說明
// （import.meta 在正式環境 CommonJS build 底下是編譯期錯誤）。
const analysisSchemaPath = join(process.cwd(), 'prisma/analysis/schema.prisma');

// Q 型（季報）model 固定五個 PK 欄位；D 型（每日/技術指標，含 beta）固定是 symbol + 一個日期欄位。
// 2026-09-01 應 bff-ts 的 screener 需求新增——見 metric.modelKey 本來就有的「這個顯示分組對應
// 哪個 model」對照關係，這裡把它進一步解析成「對應哪張實際資料表、哪個資料庫欄名」，取代
// bff-ts 原本手動維護、對照 information_schema 拼出來的 analysisMetricTables.ts。
const QUARTERLY_ID_FIELDS = ['symbol', 'year', 'season', 'dataType', 'subsidiaryCompanyId'];

export type TableShape = 'quarterly' | 'daily';

export interface QuarterlyFilterColumns {
  yearColumn: string;
  seasonColumn: string;
  dataTypeColumn: string;
  subsidiaryCompanyIdColumn: string;
}

export interface MetricTableInfo {
  metricKey: string;
  modelName: string;
  tableName: string;
  shape: TableShape;
  /** D 型專用：latest-row-per-symbol 要排序的日期欄位（資料庫欄名，例如 trade_date/as_of_date）。 */
  dateColumn?: string;
  /** Q 型專用：篩「合併報表、非子公司」唯一一筆用得到的欄位。 */
  quarterlyFilterColumns?: QuarterlyFilterColumns;
}

export interface ResolvedField extends MetricTableInfo {
  fieldKey: string;
  valueColumn: string;
}

const deriveModelName = (modelKey: string): string => `${modelKey.charAt(0).toUpperCase()}${modelKey.slice(1)}Result`;

const deriveShape = (model: ModelIntrospection): { shape: TableShape; dateColumn?: string; quarterlyFilterColumns?: QuarterlyFilterColumns } => {
  const idFieldSet = new Set(model.idFields);
  const isQuarterly = QUARTERLY_ID_FIELDS.every((f) => idFieldSet.has(f)) && model.idFields.length === QUARTERLY_ID_FIELDS.length;
  if (isQuarterly) {
    return {
      shape: 'quarterly',
      quarterlyFilterColumns: {
        yearColumn: model.fields.get('year')!.columnName,
        seasonColumn: model.fields.get('season')!.columnName,
        dataTypeColumn: model.fields.get('dataType')!.columnName,
        subsidiaryCompanyIdColumn: model.fields.get('subsidiaryCompanyId')!.columnName,
      },
    };
  }

  if (model.idFields.length === 2 && model.idFields.includes('symbol')) {
    const dateField = model.idFields.find((f) => f !== 'symbol')!;
    const dateColumn = model.fields.get(dateField)?.columnName;
    if (!dateColumn) {
      throw new Error(`metricTableRegistry: model ${model.modelName} 的日期欄位 "${dateField}" 在 fields 裡找不到，schema.prisma 可能有語法本解析器不支援的寫法。`);
    }
    return { shape: 'daily', dateColumn };
  }

  throw new Error(
    `metricTableRegistry: model ${model.modelName} 的 @@id 是 [${model.idFields.join(', ')}]，不符合目前已知的兩種形狀（季報五欄位 / symbol+單一日期欄位）——是新的表結構嗎？需要擴充 deriveShape 的判斷邏輯，不能悄悄用錯的形狀去查。`,
  );
};

interface RegistryState {
  models: Map<string, ModelIntrospection>;
  registry: Map<string, MetricTableInfo>;
}

const buildState = (): RegistryState => {
  const schemaText = readFileSync(analysisSchemaPath, 'utf-8');
  const models = parseAnalysisSchemaModels(schemaText);
  const metrics = new Map<string, FilterMetric>();
  for (const category of filterCatalog) {
    for (const metric of category.metrics) {
      metrics.set(metric.key, metric);
    }
  }

  const registry = new Map<string, MetricTableInfo>();
  for (const metric of metrics.values()) {
    if (registry.has(metric.key)) continue; // 同一個 modelKey 底下多個顯示分組共用同一筆 MetricTableInfo，算過一次就好。
    const modelKey = metric.modelKey ?? metric.key;
    const modelName = deriveModelName(modelKey);
    const model = models.get(modelName);
    if (!model) {
      throw new Error(`metricTableRegistry: filterCatalog.ts 的 "${metric.key}"（modelKey: "${modelKey}"）在 prisma/analysis/schema.prisma 找不到 model "${modelName}"。`);
    }
    if (!model.tableName) {
      throw new Error(`metricTableRegistry: model ${model.modelName} 沒有 @@map，抓不到實際資料表名稱。`);
    }
    const { shape, dateColumn, quarterlyFilterColumns } = deriveShape(model);
    registry.set(metric.key, { metricKey: metric.key, modelName: model.modelName, tableName: model.tableName, shape, dateColumn, quarterlyFilterColumns });
  }
  return { models, registry };
};

let cachedState: RegistryState | null = null;

const getState = (): RegistryState => {
  if (!cachedState) cachedState = buildState();
  return cachedState;
};

// 跟 filterCatalogCheck.ts 的 checkFilterCatalogConsistency 同一個時機（伺服器啟動時）呼叫，
// 任何 metric 解析不出對應 model、或 model 形狀不符合已知的兩種形狀，開發環境直接 throw、
// production 只記 log 讓服務繼續啟動（跟 checkFilterCatalogConsistency 同一種容錯原則：
// 這種 metadata 落差不該讓整個服務掛掉，但開發時要在啟動當下就發現）。
export const validateMetricTableRegistry = (isProduction: boolean): void => {
  try {
    cachedState = buildState();
    console.log('[metric-table-registry]: filterCatalog.ts 的每個 metric 都能解析出對應的 table/欄位。');
  } catch (error) {
    console.error('[metric-table-registry]: 建表失敗。', error);
    if (!isProduction) throw error;
  }
};

export const getTableForMetric = (metricKey: string): MetricTableInfo | null => getState().registry.get(metricKey) ?? null;

// screener 用——"metricKey.fieldKey" 的 fieldKey 部分要對到 model 裡實際的欄位（資料庫欄名）。
export const resolveField = (metricKey: string, fieldKey: string): ResolvedField | null => {
  const { models, registry } = getState();
  const tableInfo = registry.get(metricKey);
  if (!tableInfo) return null;

  const model = models.get(tableInfo.modelName)!; // 一定找得到，registry 建立時已經驗證過。
  const field = model.fields.get(fieldKey);
  if (!field) return null;

  return { ...tableInfo, fieldKey, valueColumn: field.columnName };
};
