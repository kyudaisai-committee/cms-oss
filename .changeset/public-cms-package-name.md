---
"@repo/cli": patch
---

製品 CLI の公開 package 名を `@kyudaisai/cms` に変更します。
利用側は次の製品 Release で `@repo/cli` を新しい tarball に置き換え、設定 import を更新してから `cms init` と `cms typegen` を再実行してください。package 名の変更に伴う D1 schema、データ、migration SQL、適用履歴の変更はありません。
