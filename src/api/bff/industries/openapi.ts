import { registry } from '@/adapters/swagger/registry';
import { getIndustryTreeQuerySchema } from './controller';
import { industryTreeNodeResultSchema } from './types';

export const registerIndustriesOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/industries/tree',
    summary: '產業分類階層瀏覽（財政部稅籍五層分類，展開/收合樹狀結構用）',
    description:
      '資料源跟 GET /companies/peer-group 相同（gov-ts 財政部稅籍行業標準分類 section/division/group/class/subclass），' +
      '但這支端點是純瀏覽語意，不做動態層級回退：給一個 code（或不給，代表要樹根/全部 section），回傳它的直屬子節點' +
      '（children）跟精確分類在這個 code 的公司清單（companies）。code 全域唯一，不需要另外傳 level。\n\n' +
      'companyCount 每一層都是「這個節點含所有子孫節點」的公司數加總；companies 則是「精確符合這個 code」' +
      '（不含子孫）——因為 999 家已追蹤公司都分類到 subclass 這個最細層級，companies 在 section/division/' +
      'group/class 層級永遠是空陣列，只有展開到 subclass 才會看到實際公司名單，請改用 companyCount 判斷' +
      '一個分支底下大概有多少公司值不值得展開。\n\n' +
      'found:false 代表帶了 code 但這個代碼在字典裡查無資料（例如打錯字），此時其餘欄位皆為預設空值；' +
      '不帶 code（查樹根）恆為 found:true。範圍限定在 999 家已追蹤公司，不含 KY 股（境外註冊公司結構上沒有台灣稅籍）。',
    tags: ['Industries'],
    request: { query: getIndustryTreeQuerySchema },
    responses: {
      200: { description: '產業節點的直屬子節點與精確分類的公司清單。', content: { 'application/json': { schema: industryTreeNodeResultSchema } } },
      400: { description: 'code 是空字串。' },
    },
  });
};
