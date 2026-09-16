// 2026-09-17：改用函式形式、固定跑整份 `pnpm lint`，不把 staged 檔案清單附加到命令列——
// clean architecture 重構的 [move-only] commit 一次會動 200~700 個檔案，逐檔傳路徑會撞
// Windows 命令列長度上限，加上 lint-staged 暫存/還原部分變更時 oxlint 的型別感知模式會看到
// 「檔案搬了、被 import 的檔案還沒搬」的半套快照而誤報。oxlint 掃整個專案只要幾秒，直接掃全部。
module.exports = {
  '*.ts': () => 'pnpm lint',
};
