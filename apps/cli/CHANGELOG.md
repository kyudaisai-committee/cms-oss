# @repo/cli

## 0.1.0-alpha.2

### Patch Changes

- aa75637: CMS の製品バージョンと DB の変更履歴を分離し、DB に変更がないバージョン更新でスキーマ情報を手動登録する必要をなくします。実際のスキーマと記録済み snapshot の一致を配布前に検証します。
- @repo/config@0.1.0-alpha.2
    - @repo/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- d8ee2dc: 製品 CLI の公開 package 名を `@kyudaisai/cms` に変更します。
  利用側は次の製品 Release で `@repo/cli` を新しい tarball に置き換え、設定 import を更新してから `cms init` と `cms typegen` を再実行してください。package 名の変更に伴う D1 schema、データ、migration SQL、適用履歴の変更はありません。
- ac993d3: 生成した利用側アプリの型検査設定を補い、必要なReactとNode.jsの型定義を製品tarballに含めます。
- @repo/config@0.1.0-alpha.1
    - @repo/core@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- 5375011: 利用側プロジェクトの初期化・開発・build・deployを行うCLIと設定、DB migration支援、Waku管理画面、API、Markdown editorを初回のCMS製品としてまとめます。これはCMS製品の初回リリースで、以前のCMS版から移行するDB変更はありません。初期schemaは `core-schema-v1` で、利用側が `cms migrate init` からDDLを生成・確認・適用します。CMSは利用側のDB migrationを自動適用しません。

### Patch Changes

- Updated dependencies [5375011]
    - @repo/core@0.1.0-alpha.0
    - @repo/config@0.1.0-alpha.0
