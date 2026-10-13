import { Banner, Loader } from "@cloudflare/kumo";

export function LoadingMessage() {
	return (
		<Banner icon={<Loader aria-label="読み込み中" size="sm" />} role="status">
			読み込み中…
		</Banner>
	);
}
