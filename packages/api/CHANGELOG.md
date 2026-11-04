# @repo/api

## 0.1.0-alpha.3

### Patch Changes

- dea9444: Import endpoint success responses now document their data envelopes.
- d039783: 公開ニュース詳細でGETとQUERYの両方から同じ言語指定を受け付けます。
- f76dfd0: Asset download filenames now preserve Unicode without creating invalid headers.
- Updated dependencies [b18bfdd]
- Updated dependencies [1458609]
    - @repo/core@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- @repo/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @repo/core@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- 5375011: 利用側プロジェクトの初期化・開発・build・deployを行うCLIと設定、DB migration支援、Waku管理画面、API、Markdown editorを初回のCMS製品としてまとめます。これはCMS製品の初回リリースで、以前のCMS版から移行するDB変更はありません。初期schemaは `core-schema-v1` で、利用側が `cms migrate init` からDDLを生成・確認・適用します。CMSは利用側のDB migrationを自動適用しません。

### Patch Changes

- Updated dependencies [5375011]
    - @repo/core@0.1.0-alpha.0
