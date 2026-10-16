# @repo/config

## 0.1.0-alpha.1

No changes in this release.

## 0.1.0-alpha.0

### Minor Changes

- 5375011: 利用側プロジェクトの初期化・開発・build・deployを行うCLIと設定、DB migration支援、Waku管理画面、API、Markdown editorを初回のCMS製品としてまとめます。これはCMS製品の初回リリースで、以前のCMS版から移行するDB変更はありません。初期schemaは `core-schema-v1` で、利用側が `cms migrate init` からDDLを生成・確認・適用します。CMSは利用側のDB migrationを自動適用しません。
