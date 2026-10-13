# お知らせ CMS

Waku 1.0.0-rc.3 と Cloudflare Workers を使った、年度 (`year`) × サイト (`site`) 境界のお知らせ CMS です。サイト識別子と表示名は利用者が定義できます。

## Workspace

- `apps/web` は Waku の管理画面、CMS preview、Cloudflare Worker の入口と表示設定を持ちます。
- `packages/api` は Hono API、HTTP 契約、OpenAPI、Cloudflare Access JWT 検証、D1/R2 接続、API cache を持ちます。単独の Worker は持たず、`apps/web` の Worker から同じ `/api/v1` URL で呼び出します。
- `packages/core` は CMS の型・業務スキーマ・入力検証・業務処理・D1 schema (`packages/core/src/db/schema.ts`)・repository を持ちます。migration SQL と適用履歴は利用者が管理します。
- `packages/editor` は CMS に依存しない Markdown エディター部品を持ちます。

依存方向は `apps/web` から `packages/api`、`packages/core`、`packages/editor` に向かい、`packages/api` は `packages/core` を使います。`packages/*` は `apps/*` に依存しません。`core` と `editor` は互いに依存せず、各 workspace は公開 package export を通じて参照します。HTTP と UI の責務を `core` に持ち込みません。

`@repo/api/server` の `createApiApp` は `apps/web` の Waku や表示設定に依存せず Hono app を生成します。D1/R2 と Access 設定はリクエスト時の Worker bindings から受け取ります。`packages/core` の service は D1 接続を受け取って業務処理を行い、`packages/editor` は CMS の型や設定なしで Markdown 編集に使えます。各 workspace は個別に型検査とテストを実行でき、Worker と URL を組み立てて deploy する実行単位は `apps/web` です。

Waku のアプリ本体、Worker entry、開発用 Wrangler 設定と deploy は `apps/web` が所有します。`apps/cli` は利用側の設定を読み、再生成可能な `.cms/` からそのアプリを起動するコマンドを提供します。`packages/api` は同じ Worker に組み込む workspace で、独自の Worker entry、Wrangler 設定、deploy command は持ちません。ルートでは workspace 全体の検査を実行し、`pnpm verify` は全 package の型検査・テスト・build を対象にします。

## 開発

依存関係をインストールした後、`pnpm --filter @repo/web run dev` で Waku と API を含む Worker の開発サーバーを起動します。開発サーバーは D1 schema を自動作成しません。`packages/core/src/db/schema.ts` が schema の定義元で、初期 DDL と migration SQL は利用側の Drizzle Kit 設定に生成し、明示的に D1 へ適用してください。このリポジトリは利用側の migration ファイルや適用履歴を保持しません。Cloudflare Vite plugin と Wrangler は `apps/web/.wrangler/state` にローカル binding state を保存します。

開発時は Cloudflare の `workerd` が `eval()` を許可しないため、React の RSC client が stack trace 再構築用に試す `eval()` が警告になります。開発時の stack trace 再構築は制限されますが、React は本番ではこの `eval()` を使用しません。

`pnpm verify` は formatter、lint、全 package の TypeScript 検査・Vitest、Waku build を順番に実行します。リポジトリ内の Worker deploy は Cloudflare リソースを用意し、`apps/web/wrangler.toml` の例示値を置き換えた後に `pnpm --filter @repo/web run deploy` で実行します。利用側からは CMS CLI の `cms deploy` を使えます。どちらも Worker の build/deploy のみを行い、DB migration は適用しません。

## API

API のベースは `/api/v1` です。

- `GET /api/v1/scopes`
- `GET|QUERY /api/v1/{year}/{site}/news` と `GET /{slug}`（GET は URL query parameters、QUERY は JSON request body）
- `GET|POST|PATCH|DELETE /api/v1/admin/{year}/{site}/news`
- `POST /api/v1/admin/{year}/{site}/news/{id}/publish|unpublish`
- `PUT|PATCH /api/v1/admin/{year}/{site}/news/{id}/translations/{lang}`
- `POST /api/v1/admin/{year}/{site}/news/{id}/translations/{lang}/publish|unpublish`
- `GET /api/v1/admin/export`、`GET /api/v1/admin/{year}/{site}/export`
- `GET /api/v1/admin/export/schema`
- `POST /api/v1/admin/{year}/{site}/import/preview`、`POST /api/v1/admin/{year}/{site}/import`
- `PATCH /api/v1/admin/scopes/{year}/{site}`（利用可能言語と既定言語）
- `GET|POST|PATCH|DELETE /api/v1/admin/{year}/{site}/tags`
- `GET /api/v1/{year}/{site}/assets/{id}`、`POST /api/v1/admin/{year}/{site}/assets`

公開 API の OpenAPI 定義は `/api/v1/openapi.json`、Swagger UI は `/api/v1/docs` です。管理 API の定義は `/api/v1/admin/openapi.json`、Swagger UI は `/api/v1/admin/docs` です。管理用ドキュメントを含む `/api/v1/admin/**` は、Cloudflare Access が付与する `CF-Access-Jwt-Assertion` の署名・issuer・audience・有効期限をアプリケーションでも検証します。`@repo/api/client` の `createApiClient` が Hono の `ApiType` に基づく typed client を提供し、HTTP 契約は `@repo/api/contracts` から利用できます。`apps/web` の API catch-all が `createApiApp` を Worker の同じ URL に接続します。

公開ニュース一覧の GET は `tag`、`cursor`、`limit`、`lang` を URL query parameters で受け付けます。QUERY は同じ条件を `application/json` の request body（例: `{ "tag": "important", "limit": 10, "lang": "en" }`）で受け付けます。両方の入力は同じ検索処理へ正規化されます。個別ニュース取得（`GET /{slug}`）でも `?lang=` による言語指定に対応し、未指定時はスコープごとの `defaultLanguage` を返します。言語タグは BCP 47 を受け付け、`Intl.getCanonicalLocales` 相当で正規化します。指定言語の翻訳がない場合は暗黙に別言語へフォールバックせず、一覧では除外、詳細では404を返します。各スコープの `availableLanguages` は1件以上にし、`defaultLanguage` はその配列に含める必要があります。既存翻訳がある言語は、翻訳を移行・削除するまでスコープ設定から削除できません。

管理用エクスポートは、複数スコープを並べたトップレベル配列のJSONを返します。CMS の `/settings` から全スコープ、`/{year}/{site}/settings` から対象スコープをダウンロードできます。API では全スコープまたは年度とサイトを指定してダウンロードでき、`/api/v1/admin/export/schema` から同じ形式のJSON Schemaを取得できます。エクスポートには画像ファイルや画像メタデータは含まれず、お知らせ本文に保存された画像URLはそのまま出力されます。

スコープ設定画面のインポートでは、JSON配列から元スコープを1件選び、重複記事のスキップまたは新しいslugでの追加、翻訳言語の追加または既存言語への変更をプレビューして取り込めます。取り込み先は表示中のスコープに固定され、既存記事は更新されません。インポートでも画像ファイルは含まれず、本文中のURLをそのまま保持します。

## Cloudflare と D1 schema

CMS と利用側プロジェクトの責任分担は次のとおりです。

| 管理対象                                                       | 所有・管理する側   |
| -------------------------------------------------------------- | ------------------ |
| CMS 本体と現行の Drizzle schema                                | CMS 側             |
| DB 変更の仕様、データ変換規則、移行手順                        | CMS 側             |
| 利用先固有の設定、CMS の依存バージョンと lockfile              | 利用側プロジェクト |
| Drizzle Kit 設定、migration SQL、snapshot、journal             | 利用側プロジェクト |
| Cloudflare リソース、Secrets、D1 のデータと migration 適用履歴 | 利用側             |

migration は利用側プロジェクトで生成・検証し、利用側が適用するタイミングを決めます。CMS の依存更新によって、利用側の設定や migration 履歴を上書き・初期化しません。`cms init` が生成する `.cms/` には再生成可能な接続ファイルだけを置き、migration 履歴やローカル D1/R2 の永続状態は含めません。

利用側では `cms init` が `cms.config.ts`、`drizzle.config.ts`、再生成可能な `.cms/` を用意します。`cms.config.ts` に対象 Worker と D1 の名前・IDを設定し、利用側が所有する Wrangler 設定を `--wrangler-config` で選びます。`cms typegen` と D1 操作はこの既存設定を公式 Wrangler CLI に渡し、CMS が Wrangler 設定ファイルを生成・変更することはありません。環境を使う場合は、CMS 設定と Wrangler 設定の双方で同じ `--env` を選択します。

初回導入では `cms migrate init` が現行 schema から初期 SQL、Drizzle snapshot / journal、migration 状態を利用側の `drizzle.config.ts` の `out` へ生成します。DB へは接続・適用しません。Wrangler の選択した D1 binding に `migrations_dir` を設定し、その値を Drizzle の `out`（既定値は `./drizzle`）に合わせてください。`cms d1 migrations list --local` で対象を確認し、利用側のローカル D1 に適用する場合は `cms d1 migrations apply --local` を明示的に実行します。リモート環境には `--remote` を指定します。どちらのコマンドも対象 D1、環境、既存設定の binding、Drizzle の出力先が一致しなければ実行を止めます。`--local` は `.wrangler/state` を使い、生成プロジェクトの Waku と同じ永続状態を参照します。

初期 migration の適用を確認してから `cms migrate mark-baseline --version 0.1.0` を実行し、利用側が管理する `drizzle/cms-state.json` に baseline を記録します。既存 DB の baseline は、実際の schema と D1 の `d1_migrations` 履歴を確認したうえで利用側が明示してください。`cms migrate` は依存更新後の変更を表示し、`cms migrate --codex` または `cms migrate --claude` は利用側 migration の準備を支援します。agent の終了だけでは準備済み状態を記録せず、レビュー後に `cms migrate mark-prepared --version <version>` を実行します。D1 適用履歴は Wrangler の `d1_migrations` にあり、CMS の migration 状態ファイルには複製しません。

リポジトリ内の開発用 `apps/web/wrangler.toml` は Worker 名、D1 database ID、R2 bucket、route、Cloudflare Access の例示値を含みます。開発 deploy の前に対象 Cloudflare アカウントの値へ置き換え、必要な D1 database と R2 bucket を作成してください。利用側は自身の既存 Wrangler 設定を CMS CLI に指定します。binding 名 `DB`、`ASSETS`、`STATIC_ASSETS` はアプリが参照するため維持してください。

DB schema は `packages/core/src/db/schema.ts` が現行定義です。CMS CLI は初期 DDL の生成を補助しますが、migration SQL、Drizzle snapshot / journal、schema 状態、D1 の適用履歴は利用者が所有します。既存 DB を更新する場合は、実際の適用履歴を維持したうえで、その DB の schema から現行 schema への差分 migration を作成・確認してから適用してください。実 DB の schema が現行定義と一致している場合、初期 DDL の再適用や履歴の reset は不要です。Worker の deploy は migration を実行しません。

DB に影響する変更案内には、対象 version と前提 schema、データ変換規則、保持される ID と関係、適用順序と適用を省略できる条件、移行後の確認方法を記載し、利用者が更新前に自身の migration を準備・確認できるようにします。

管理 API を公開するドメインを Cloudflare Access の Application で保護し、`ACCESS_TEAM_DOMAIN` と `ACCESS_AUDIENCE` を Worker に設定してください。`/api/v1/admin/**` は本番では Access 経由の `CF-Access-Jwt-Assertion` が必須で、アプリケーションが Access の JWKS を使って署名・issuer・audience・有効期限を検証します。監査 actor は検証済み JWT の `sub` / `email`（ユーザー）または `common_name`（service token）だけから作られ、署名されていない identity header は信頼しません。公開 API は認証不要です。開発時は loopback のローカルリクエストに限り、JWT が欠落している場合だけ local actor にフォールバックします。不正な JWT が提示された場合は開発時も拒否します。Worker service binding や本番環境から管理 API を呼ぶ場合は JWT 検証を迂回できないため、Cloudflare Access の service token などを利用して Access 経由でアクセスしてください。

別 Worker から service binding を設定する例:

```toml
[[services]]
binding = "CMS"
service = "cms"
```

```ts
const response = await env.CMS.fetch(
    new Request("https://cms.internal/api/v1/2026/example-site/news"),
);
```
