# お知らせ CMS

Waku 1.0.0-rc.3 と Cloudflare Workers を使った、年度 (`year`) × サイト (`site`) 境界のお知らせ CMS です。サイト識別子と表示名は利用者が定義できます。

## Workspace

- `apps/web` は Waku の管理画面、CMS preview、Hono API route、Cloudflare Worker の入口と接続処理を持ちます。API と画面は同じ Worker で動作します。
- `packages/core` は CMS の型・入力検証・DB schema・repository・service を持ちます。
- `packages/editor` は Lexical エディター部品を持ちます。
- D1 schema は `packages/core/src/db/schema.ts` で定義します。migration SQL と適用履歴は利用者が管理します。

`apps/web` に Waku と Wrangler のアプリ固有コマンドを置き、ルートでは workspace 全体の検査を実行します。`pnpm verify` は全 package の型検査・テスト・build を対象にします。

## 開発

依存関係をインストールした後、`pnpm --filter @repo/web run dev` で Waku の開発サーバーを起動します。開発サーバーは D1 schema を自動作成しません。利用者が `packages/core/src/db/schema.ts` を基に初期 DDL を生成・適用し、ローカルの Cloudflare binding を用意してください。migration SQL、Drizzle Kit 設定、適用履歴はこのリポジトリでは管理しません。Cloudflare Vite plugin と Wrangler は `apps/web/.wrangler/state` にローカル binding state を保存します。

開発時は Cloudflare の `workerd` が `eval()` を許可しないため、React の RSC client が stack trace 再構築用に試す `eval()` が警告になります。開発時の stack trace 再構築は制限されますが、React は本番ではこの `eval()` を使用しません。

`pnpm verify` は formatter、lint、全 package の TypeScript 検査・Vitest、Waku build を順番に実行します。deploy は Cloudflare リソースを用意し、`apps/web/wrangler.toml` の例示値を置き換えた後に `pnpm --filter @repo/web run deploy` で実行します。このコマンドは `wrangler deploy` のみを実行し、DB migration は適用しません。

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

公開 API の OpenAPI 定義は `/api/v1/openapi.json`、Swagger UI は `/api/v1/docs` です。管理 API の定義は `/api/v1/admin/openapi.json`、Swagger UI は `/api/v1/admin/docs` です。管理用ドキュメントを含む `/api/v1/admin/**` は、Cloudflare Access が付与する `CF-Access-Jwt-Assertion` の署名・issuer・audience・有効期限をアプリケーションでも検証します。`apps/web/src/api/client.ts` の `createApiClient` が Hono の `ApiType` に基づく typed client を提供します。

公開ニュース一覧の GET は `tag`、`cursor`、`limit`、`lang` を URL query parameters で受け付けます。QUERY は同じ条件を `application/json` の request body（例: `{ "tag": "important", "limit": 10, "lang": "en" }`）で受け付けます。両方の入力は同じ検索処理へ正規化されます。個別ニュース取得（`GET /{slug}`）でも `?lang=` による言語指定に対応し、未指定時はスコープごとの `defaultLanguage` を返します。言語タグは BCP 47 を受け付け、`Intl.getCanonicalLocales` 相当で正規化します。指定言語の翻訳がない場合は暗黙に別言語へフォールバックせず、一覧では除外、詳細では404を返します。各スコープの `availableLanguages` は1件以上にし、`defaultLanguage` はその配列に含める必要があります。既存翻訳がある言語は、翻訳を移行・削除するまでスコープ設定から削除できません。

管理用エクスポートは、複数スコープを並べたトップレベル配列のJSONを返します。CMS の `/settings` から全スコープ、`/{year}/{site}/settings` から対象スコープをダウンロードできます。API では全スコープまたは年度とサイトを指定してダウンロードでき、`/api/v1/admin/export/schema` から同じ形式のJSON Schemaを取得できます。エクスポートには画像ファイルや画像メタデータは含まれず、お知らせ本文に保存された画像URLはそのまま出力されます。

スコープ設定画面のインポートでは、JSON配列から元スコープを1件選び、重複記事のスキップまたは新しいslugでの追加、翻訳言語の追加または既存言語への変更をプレビューして取り込めます。取り込み先は表示中のスコープに固定され、既存記事は更新されません。インポートでも画像ファイルは含まれず、本文中のURLをそのまま保持します。

## Cloudflare と D1 schema

`apps/web/wrangler.toml` は Worker 名、D1 database ID、R2 bucket、route、Cloudflare Access の例示値を含みます。deploy 前に対象 Cloudflare アカウントの値へ置き換え、必要な D1 database と R2 bucket を作成してください。binding 名 `DB`、`ASSETS`、`STATIC_ASSETS` はアプリが参照するため維持してください。

DB schema は `packages/core/src/db/schema.ts` が現行定義です。このリポジトリは migration SQL、Drizzle Kit の設定、migration journal を配布せず、初期 migration も生成しません。新しい DB を用意する利用者は現行 schema から初期 DDL を生成して適用し、その後の migration SQL と適用履歴も自身の運用環境で管理してください。既存 DB を更新する場合は、適用済みの履歴を維持したうえで、その DB の schema から現行 schema への差分 migration を作成・確認してから適用してください。既存 SQL、Drizzle snapshot / journal、D1 の適用履歴は利用者の運用資産として保持し、実 DB の schema が現行定義と一致している場合は初期 DDL の再適用や履歴の reset は不要です。Worker の deploy は migration を実行しません。

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
