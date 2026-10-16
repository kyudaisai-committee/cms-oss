# @repo/web

## 0.1.0-alpha.2

### Patch Changes

- 16f9e6a: 製品 tarball でも Tailwind がインストール済みの Kumo と editor のスタイルを生成できるようにします。
- @repo/api@0.1.0-alpha.2
    - @repo/config@0.1.0-alpha.2
    - @repo/core@0.1.0-alpha.2
    - @repo/editor@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- fd2b7f2: 開発用 RSC server が Cloudflare Vite plugin の依存最適化と連携できず失敗する問題を修正します。
- @repo/api@0.1.0-alpha.1
    - @repo/config@0.1.0-alpha.1
    - @repo/core@0.1.0-alpha.1
    - @repo/editor@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- 5375011: 利用側プロジェクトの初期化・開発・build・deployを行うCLIと設定、DB migration支援、Waku管理画面、API、Markdown editorを初回のCMS製品としてまとめます。これはCMS製品の初回リリースで、以前のCMS版から移行するDB変更はありません。初期schemaは `core-schema-v1` で、利用側が `cms migrate init` からDDLを生成・確認・適用します。CMSは利用側のDB migrationを自動適用しません。

### Patch Changes

- Updated dependencies [5375011]
    - @repo/api@0.1.0-alpha.0
    - @repo/core@0.1.0-alpha.0
    - @repo/editor@0.1.0-alpha.0
    - @repo/config@0.1.0-alpha.0
