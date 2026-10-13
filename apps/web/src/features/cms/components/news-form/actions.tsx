import { Button } from "@cloudflare/kumo";
import { SaveIcon, SendIcon, Trash2Icon } from "lucide-react";

export function NewsFormActions({
	isAlreadyPublished,
	isEdit,
	pending,
	onDeleteRequest,
	onPublishRequest,
}: {
	isAlreadyPublished: boolean;
	isEdit: boolean;
	pending: boolean;
	onDeleteRequest: () => void;
	onPublishRequest: () => void;
}) {
	return (
		<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
			{isEdit ? (
				<Button type="button" variant="destructive" disabled={pending} onClick={onDeleteRequest}>
					<Trash2Icon aria-hidden="true" className="size-4" />
					削除
				</Button>
			) : (
				<span />
			)}
			<div className="flex flex-wrap justify-end gap-2">
				<Button type="submit" variant="secondary" disabled={pending} loading={pending}>
					<SaveIcon aria-hidden="true" className="size-4" />
					保存
				</Button>
				<Button
					type="button"
					variant="primary"
					disabled={pending || isAlreadyPublished}
					loading={pending}
					onClick={onPublishRequest}
				>
					<SendIcon aria-hidden="true" className="size-4" />
					{isAlreadyPublished ? "公開済み" : "公開する"}
				</Button>
			</div>
		</div>
	);
}
