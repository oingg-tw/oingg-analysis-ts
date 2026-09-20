// 2026-09-20 掃描所有「給終端使用者看」的文案有沒有 web-nuxt 合規清單上的禁用詞——前端只能原文渲染
// 不能改字，所以違規句一律由後端這邊修。清單來源是 web-nuxt scripts/check-hub-pages.mjs 的 BANNED regex
// （見 memory reference_web_nuxt_banned_words）：三類，估值判斷（便宜/合理/昂貴/偏低/偏高/目標價/推薦買進）、
// 比較與排名（優於/勝過/領先/贏過/排名前段/表現突出）、單獨兩個（穩健、資料不足）。
//
// 純子字串比對、不看語意也不看否定（「不代表便宜」會中、「合理化」會中）——跟 web-nuxt 那邊一致，
// 他們不放寬 regex 而是用白名單豁免；我們這邊乾脆不留假陽性，逐句改成中性措辭（偏高→較高、合理→相稱/
// 常態、優於預期→超出預期、資料不足→尚無資料/資料不齊）。
//
// 用 runtime 匯入登錄檔掃，不 grep 原始碼——原始碼註解裡本來就會出現這些詞（例如解釋為什麼不能用）。
// 掃描範圍：badge 的 name/summary/detail/threshold.description/note/warning.note、metricNarratives 三段、
// 指標 name/nameSuffix、Piotroski 分組說明與訊號標籤。formulaNote 不在 GET /metrics 回應裡，不掃。
// 用法：npx tsx scripts/scanBannedWords.ts（有命中 exit 1，pre-push 可以接）。
import { badgeRegistry } from '../src/domain/metrics/badgeRegistry';
import { metricNarrativeRegistry } from '../src/domain/metrics/metricNarratives';
import { metricDefinitionRegistry, PIOTROSKI_GROUP_METADATA, PIOTROSKI_SIGNAL_LABELS } from '../src/bootstrap/metricDefinitions';

const BANNED = /便宜|合理|昂貴|偏低|偏高|穩健|優於|勝過|領先|贏過|排名前段|表現突出|資料不足|推薦買進|目標價/g;
const hits: string[] = [];
const check = (where: string, text: string | undefined) => {
  if (!text) return;
  for (const m of text.matchAll(BANNED)) {
    const i = m.index!;
    hits.push(`${where.padEnd(52)} 「${m[0]}」 …${text.slice(Math.max(0, i - 18), i + m[0].length + 18)}…`);
  }
};
for (const [code, b] of Object.entries(badgeRegistry)) {
  check(`badge.${code}.name`, b.name); check(`badge.${code}.summary`, b.summary); check(`badge.${code}.detail`, b.detail);
  check(`badge.${code}.threshold.note`, b.threshold.note); check(`badge.${code}.threshold.description`, b.threshold.description);
  check(`badge.${code}.warning.note`, b.threshold.warning?.note);
}
for (const [code, n] of Object.entries(metricNarrativeRegistry)) {
  check(`narrative.${code}.description`, n.description); check(`narrative.${code}.limitations`, n.limitations); check(`narrative.${code}.misreadings`, n.misreadings);
}
for (const [code, d] of Object.entries(metricDefinitionRegistry)) { check(`metric.${code}.name`, d.name); check(`metric.${code}.nameSuffix`, d.nameSuffix); }
for (const g of PIOTROSKI_GROUP_METADATA as unknown as { key: string; name: string; summary: string; detail: string }[]) {
  check(`piotroskiGroup.${g.key}.name`, g.name); check(`piotroskiGroup.${g.key}.summary`, g.summary); check(`piotroskiGroup.${g.key}.detail`, g.detail);
}
for (const [k, v] of Object.entries(PIOTROSKI_SIGNAL_LABELS)) check(`piotroskiSignal.${k}`, v);
console.log(`共命中 ${hits.length} 處`);
for (const h of hits) console.log(h);
if (hits.length > 0) process.exitCode = 1;
