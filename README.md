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

## バージョン管理

6つの `@repo/*` package は Changesets の fixed group で同じ SemVer に揃えます。package は private な内部実装で、独立した package release は行いません。Changesets は version PR に各 package の `CHANGELOG.md` を生成し、GitHub Release では対象versionの製品変更を1つのノートにまとめます。製品tarballには全履歴を `changelogs/{cli,web,api,core,editor,config}.md` として収録します。利用側は製品を更新した後、DB変更が記載されたchangelogを確認してから、自身のDB migrationを準備・適用してください。changeset を追加・確認して version を更新するには、次を実行します。

```sh
pnpm changeset
pnpm changeset:status
pnpm changeset:version
```

初回変更は minor changeset で、alpha prerelease mode を有効にしているため、6 package は `0.0.0` から `0.1.0-alpha.0` になります。`changeset:version` は package version を更新し、pnpm lockfile を再生成します。新しい prerelease cycle は `pnpm changeset pre enter alpha` で開始し、終了時に `pnpm changeset pre exit` を実行します。

main への push を契機に、GitHub Actions が Changesets の version PR を作成または更新します。その PR の merge 後は、全 workspace の検証と製品 CLI の pack を行い、`v<version>` GitHub Release を作成して `repo-cli-<version>.tgz` を添付します。SemVer prerelease は GitHub の pre-release として公開し、npm registry へは publish しません。未公開の `0.0.0` は skip し、同じ version の Release と asset が既にあれば何も変更しません。公開済み Release の asset が欠けている場合は workflow を失敗させ、既存 Release を置き換えません。

DBに影響するchangesetには、対象version、変更前後のschema、データ変換・既定値・重複や欠損値の扱い、保持・削除されるID/関係/値、適用順序と適用を省略できる条件、適用後の確認方法を記載します。生成された詳細は各packageの `CHANGELOG.md` と製品tarball内の `changelogs/` に残します。GitHub Releaseのノートには対象versionの説明を載せ、package名の見出しは追加しません。

version PR の自動作成には、repository settings の `Actions > General > Allow GitHub Actions to create and approve pull requests` を有効にする必要があります。workflow は必要な `contents` と `pull-requests` 権限を指定します。

CLI の `apps/cli/src/migration/release-registry.ts` には、migration の基準となる package version ごとの schema ID と database changes を記録します。package version を進める際は、現行 schema が同じ場合も registry にその version を追加し、schema または data migration がある場合は `changes` に種類、概要、詳細を記録してください。registry にない version は migration state として受け付けません。

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

利用側プロジェクトでは、GitHub Releases の製品 tarball の URL を指定して `pnpm add 'https://github.com/kyudaisai-committee/cms-oss/releases/download/<tag>/repo-cli-<version>.tgz'` を実行します。`<tag>` と `<version>` は公開済み Release と製品 asset の値に置き換えてください。現在は公開 Release がないため、この URL は形式を示す例です。利用側でリポジトリを clone・build・pack する必要はありません。

配布物を手元で作成する場合は、リポジトリのルートで `pnpm run pack:product --pack-destination /tmp/cms-product` を実行します。このコマンドは workspace の build と製品の組立を行ってから pack します。GitHub Actions の Release workflow もこのコマンドで生成した `.tgz` を Release asset として添付します。GitHub が自動生成する Source code アーカイブとは別の成果物です。npm registry への公開は含みません。

### 利用側の設定

pnpm 12 が `esbuild` / `workerd` の install script を拒否する場合は、利用側の `pnpm-workspace.yaml` の `allowBuilds` にこの2つを許可してください。既存の許可設定は維持します。

```yaml
allowBuilds:
    esbuild: true
    workerd: true
```

利用側で `cms.config.ts` と `drizzle.config.ts` を用意します。`pnpm exec cms init` は既存設定を読み、再生成可能な `.cms/` に apps/web への参照を用意します。利用側の設定ファイルを作成・変更する処理はありません。

`cms.config.ts` では、既存の Wrangler 設定を参照できます。Worker / D1 / R2 / Access の設定を重ねて記述する必要はありません。

```ts
import { defineConfig } from "@repo/cli/config";

export default defineConfig({
    name: "お知らせ CMS",
    devServer: { allowedHosts: ["cms.example.test"] },
    cloudflare: { configPath: "./wrangler.jsonc" },
});
```

表示設定は `name`、`description`、`iconUrl`、`themeStorageKey`、`newsFormStoragePrefix` の5項目です。Cloudflare の値は公開用の表示設定には含めません。Cloudflare 設定を直接指定する場合は、公式 `WorkerConfig` の `name`、`vars`、`d1_databases`、`r2_buckets` などをそのまま使います。選択した Wrangler 設定に対して、明示したフィールドを上書きし、`vars` はキーごとに結合します。明示した配列は置き換えます。CMS が管理する Worker entry と静的 assets は apps/web の設定で補います。

`--wrangler-config` は `cloudflare.configPath` より優先されます。`--env production` を付けると Wrangler の `env.production` を選び、dev / build / typegen / D1 / deploy で同じ環境を使います。存在しない環境は拒否します。`--config` の相対パスは `--cwd`、Wrangler 設定の相対パスは `cms.config.ts` のディレクトリが基準です。`WorkerConfig` 内のパスは公式 plugin に従い、選択した Wrangler 設定があればそのファイル、なければ `.cms/` が基準です。直接設定のパスを固定する場合は、ESM の API で絶対パスを指定してください。

`drizzle.config.ts` では、配布物が公開する現行 schema を ESM で参照できます。

```ts
import { cmsSchemaPath } from "@repo/cli/config";

export default {
    dialect: "sqlite",
    schema: cmsSchemaPath,
    out: "./drizzle",
};
```

利用側の既存 Wrangler 設定では、D1 binding の `migrations_dir` を Drizzle の `out` に合わせてください。CMS CLI は対象 DB の名前・ID、migration のディレクトリと履歴テーブルの明示指定を照合し、食い違う場合は D1 操作を止めます。`cms typegen` と D1 操作にはこの既存設定を公式 Wrangler CLI へ渡し、CMS 側では Wrangler 設定ファイルを生成・変更しません。

### 初期 migration と更新

初回導入では、次の明示操作で SQL 生成・ローカル D1 への適用・baseline 記録をまとめて実行できます。

```sh
pnpm exec cms init
pnpm exec cms migrate init --local
```

リモート D1 を対象にする場合は `--local` を `--remote` に置き換えます。初期 SQL と Drizzle snapshot / journal は `drizzle.config.ts` の `out`（既定は `./drizzle`）、CMS の baseline は `drizzle/cms-state.json` に保存します。Wrangler の実際の migration 履歴を確認してから baseline を記録するため、適用の取消や失敗だけでは進みません。初期化中は `drizzle/.cms-initial-pending.json` に生成した version / schema / SQL の識別情報を保持し、再実行時は同じ SQL を使います。SQL の内容が変わった場合は自動再開を止めるため、後述の個別操作で確認・適用してください。既存の migration 履歴は上書き・初期化しません。

`pnpm exec cms migrate init` と引数なしで実行した場合は、初期 SQL と履歴の生成だけを行い、DB は変更しません。生成物を確認した後、同じコマンドに `--local` / `--remote` を付けて適用できます。個別に操作する場合は `pnpm exec cms d1 migrations list --local` と `pnpm exec cms d1 migrations apply --local` を使い、適用確認後に `pnpm exec cms migrate mark-baseline --version <version>` を実行します。`<version>` には実際に導入した CMS CLI の version を指定してください。`--local` は利用側の `.wrangler/state` を使い、Waku と永続状態を共有します。

既存 DB では、実際の schema と migration 履歴を確認したうえで baseline を明示してください。依存更新後の `pnpm exec cms migrate` は変更内容と agent 指定のヒントを表示します。DB 変更がある場合に限り、`--codex` または `--claude` を付けると変更内容を渡して migration の準備を支援します。agent の終了だけでは準備済み状態を記録せず、レビュー後に `pnpm exec cms migrate mark-prepared --version <version>` を実行します。D1 適用履歴は Wrangler が管理するテーブル（既定は `d1_migrations`）に保持し、CMS 状態ファイルへ複製しません。

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
