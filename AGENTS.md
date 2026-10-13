# プロジェクト固有の開発方針

## フレームワークについて

- Wakuについてはこちらを参照してください: https://waku.gg/llms.txt
- Waku 1.0.0-rc.0 の file routing と RSC を優先し、client island は最小限にする。
- 非同期データ取得は独立した async Server Component に分け、`Suspense` 境界で描画可能なシェルや既知の情報を先に返す。fallback には Kumo の `SkeletonLine` を使って実コンテンツに近い形と寸法を保ち、レイアウトシフトを避ける。境界は依存関係と表示単位に合わせ、過剰に細分化しない。
- API は `src/pages/_api` の catch-all から typed Hono client を利用し、サーバー専用処理は `server-only` 境界を維持する。
- 公開 API で query parameter を受け付ける GET は、GET の query parameter と QUERY の JSON request body を同じ入力へ正規化して同じ処理を共有し、OpenAPI 3.2 に GET/QUERY の両 operation を定義する。
- Cloudflare Workers の D1/R2 binding と Cloudflare Access のドメイン保護を前提にする。公開 API は認証不要とし、管理 Hono アプリでは Cloudflare Access JWT を必須検証し、検証済み claim を監査 actor に利用する。
- UI は Cloudflare Kumo を最大限利用し、足りない場合のみ Base UI + StyleX を検討する。アイコンは不足時だけ lucide-react の正式 export を使う。
- 通常の見出し・本文・補足・状態表示には Kumo の `Text` など該当する公式コンポーネントを使い、素の要素と文字サイズ utility による再実装を避ける。フォーム、Badge、通知なども Kumo の component registry と型定義を確認して既存コンポーネントを優先する。
- Kumo コンポーネントの文字サイズ、背景、枠線、角丸などを独自 class で上書きして標準の見た目を崩さない。独自 CSS はエディター固有処理など Kumo で表現できない場合だけ最小限にする。
- 色は Kumo の semantic token を使い、raw Tailwind color や `dark:` variant を追加しない。テーマ切替は Kumo の `data-theme` / `data-mode` で行う。
- アプリ内リンクは原則として Kumo の `Link`、`LinkButton`、`Breadcrumbs.Link` などを使い、共通の `LinkProvider` 経由で Waku のクライアントルーターへ接続する。Waku の `Link` や素の `<a>` を画面ごとに直接使わない。外部 URL、ダウンロード、ページ内リンクなどブラウザ標準の遷移が必要な場合のみ素の `<a>` を使う。作成・削除成功後や `Select` による選択後など、リンクとして表現できない命令的な遷移に限って `useRouter` を使う。
- `../../../` のような深い相対 import は避け、`src` 配下を横断する参照には `@/` alias を使う。同一 feature 内の近距離参照は必要に応じて相対 import を使ってよい。
- モジュールのトップレベルに定義する関数は原則として `function` 宣言を使い、アロー関数はコールバックなど関数式が必要な箇所に限る。
- 構文解析は AST を最優先し、AST で扱えない場合は正規表現を使う。それ以外の方法は極力避け、必要な場合は採用前にユーザーへ相談する。
- ファイルが300行を超えたら、複数の責務が混在していないかを検証し、必要に応じて関数やモジュールを分離する。
- 責務の分離ではディレクトリ構造も考慮し、必要に応じて責務単位のディレクトリを設ける。

## 作業開始と Git

- 作業開始時に `git branch --show-current` でブランチを確認する。
- `main` では編集・コミットせず、作業ブランチ（`codex/` や `antigravity/` などの接頭辞）を使う。
- 作業ブランチから `main` 向きの Pull Request を経由する。
- コミットメッセージは、単一ワークスペースに閉じる変更では `<prefix>(<workspace>): <日本語メッセージ>` 形式（例: `fix(editor): 見出しの編集を修正`）にする。スコープには `editor`、`web`、`core` などのワークスペース名を使い、複数ワークスペースに横断する変更やルート共通の変更では `<prefix>: <日本語メッセージ>` としてスコープを省略する。無関係な変更を含めない。

## 検証

- このプロジェクトの `pnpm` と `gh` のコマンドは原則としてサンドボックス外で実行する。
- `pnpm` / `gh` が異常に長時間終了せず終了コードを返さない場合は成功扱いにせず、サンドボックスの影響を疑い、必要な承認を得てサンドボックス外で同じコマンドを再実行し、実際の終了コードを確認する。
- まだ到達していない後続工程を検証済みと報告しない。GitHub CLI がサンドボックス内で認証に失敗しても未認証と断定せず、必要な承認を得て同じコマンドをサンドボックス外で再実行する。
- 実装後は `pnpm verify`（format/lint/typecheck/Vitest/build）を実行する。pnpm と gh はサンドボックス外で実行する。
- Vitest と TypeScript 7 を使用し、型抑制 (`any`、`ts-ignore`、`eslint-disable` など) は追加しない。
- テストはユーザー操作、外部契約、データ変換などの観測可能な振る舞いを検証し、内部実装を変更しても同じ振る舞いなら通るようにする。CSS utility class、rendered HTML の部分文字列、表示文言の存在だけを固定するリファクタリング耐性のないテストは追加しない。表示文言自体が仕様である場合を除き、UI は role やユーザー操作を通して検証する。
