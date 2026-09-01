// 從 prisma/analysis/schema.prisma 的原始文字抽取「這個服務自己擁有」的 model 定義——不查活的
// 資料庫、也不用 Prisma DMMF，理由跟 filterCatalogCheck.ts 原本的說明一致：schema.prisma 本身
// 就是這個服務對 analysis DB 的 schema 唯一真相來源，改 model 一定要接著跑 migrate，
// schema.prisma 有沒有同步更新就等於資料庫有沒有同步更新。
//
// 這是從 filterCatalogCheck.ts 原本內建的 parseAnalysisSchemaFilterableFields 抽出來的共用版本
// （2026-09-01 因為 metricTableRegistry.ts 也需要同一份 schema 解析邏輯，但需要比「有哪些
// Decimal 欄位」更完整的資訊——表名、每個欄位實際的資料庫欄名、PK 組成——才抽成獨立檔案）。

export interface ModelIntrospection {
  modelName: string;
  /** 從 @@map("...") 抽出的實際資料表名稱；沒有 @@map 就是 null（理論上這批 model 都有）。 */
  tableName: string | null;
  /** 從 @@id([...]) 抽出的主鍵欄位（Prisma 欄位名，不是資料庫欄名）；沒有 @@id 就是空陣列。 */
  idFields: string[];
  /** fieldName -> {columnName, type}。columnName 有 @map 就用 @map 的值，沒有就等於 fieldName 本身。 */
  fields: Map<string, { columnName: string; type: string }>;
}

const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
const fieldLineRegex = /^(\w+)\s+(\w+)(\[\])?\??/;
const mapRegex = /@map\("([^"]+)"\)/;
const tableMapRegex = /^@@map\("([^"]+)"\)/;
const idFieldsRegex = /^@@id\(\[([^\]]+)\]\)/;

export const parseAnalysisSchemaModels = (schemaText: string): Map<string, ModelIntrospection> => {
  const byModelName = new Map<string, ModelIntrospection>();

  let modelMatch: RegExpExecArray | null;
  while ((modelMatch = modelRegex.exec(schemaText)) !== null) {
    // modelName/body 兩個 capture group 在 modelRegex 裡都是必填（沒有 `?`），match 成功就一定有值。
    const modelName = modelMatch[1]!;
    const body = modelMatch[2]!;

    const fields = new Map<string, { columnName: string; type: string }>();
    let tableName: string | null = null;
    let idFields: string[] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;

      if (line.startsWith('@@map(')) {
        const tableMatch = line.match(tableMapRegex);
        if (tableMatch) tableName = tableMatch[1]!;
        continue;
      }
      if (line.startsWith('@@id(')) {
        const idMatch = line.match(idFieldsRegex);
        if (idMatch) idFields = idMatch[1]!.split(',').map((f) => f.trim());
        continue;
      }
      if (line.startsWith('@@')) continue; // 其他 @@ 開頭的（@@unique 等）目前用不到，跳過。

      const fieldMatch = line.match(fieldLineRegex);
      if (!fieldMatch) continue;
      // fieldName/fieldType 同理，是必填 capture group。
      const fieldName = fieldMatch[1]!;
      const fieldType = fieldMatch[2]!;
      const mapMatch = line.match(mapRegex);
      fields.set(fieldName, { columnName: mapMatch ? mapMatch[1]! : fieldName, type: fieldType });
    }

    byModelName.set(modelName, { modelName, tableName, idFields, fields });
  }

  return byModelName;
};
