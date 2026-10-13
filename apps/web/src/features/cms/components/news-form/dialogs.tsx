"use client";

import { Button, Dialog } from "@cloudflare/kumo";
import { SendIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react";

export function NewsFormDialogs({
	deleteOpen,
	newsTitle,
	onDelete,
	onDeleteOpenChange,
	onPublish,
	onPublishOpenChange,
	onUnpublish,
	onUnpublishOpenChange,
	pending,
	publishOpen,
	unpublishOpen,
}: {
	deleteOpen: boolean;
	newsTitle: string | undefined;
	onDelete: () => void;
	onDeleteOpenChange: (open: boolean) => void;
	onPublish: () => void;
	onPublishOpenChange: (open: boolean) => void;
	onUnpublish: () => void;
	onUnpublishOpenChange: (open: boolean) => void;
	pending: boolean;
	publishOpen: boolean;
	unpublishOpen: boolean;
}) {
	return (
		<>
			<Dialog.Root open={publishOpen} onOpenChange={onPublishOpenChange} role="alertdialog">
				<Dialog className="grid gap-4 p-5">
					<Dialog.Title>お知らせを公開しますか？</Dialog.Title>
					<Dialog.Description>
						保存して公開します。公開日時を指定した場合は、その日時まで外部には表示されません。
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="secondary" onClick={() => onPublishOpenChange(false)}>
							<XIcon aria-hidden="true" className="size-4" />
							キャンセル
						</Button>
						<Button
							type="button"
							variant="primary"
							disabled={pending}
							loading={pending}
							onClick={() => {
								onPublishOpenChange(false);
								onPublish();
							}}
						>
							<SendIcon aria-hidden="true" className="size-4" />
							公開する
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
			<Dialog.Root open={deleteOpen} onOpenChange={onDeleteOpenChange} role="alertdialog">
				<Dialog className="grid gap-4 p-5">
					<Dialog.Title>お知らせを削除しますか？</Dialog.Title>
					<Dialog.Description>
						「{newsTitle}」を削除します。この操作は元に戻せません。
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="secondary" onClick={() => onDeleteOpenChange(false)}>
							<XIcon aria-hidden="true" className="size-4" />
							キャンセル
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={pending}
							loading={pending}
							onClick={onDelete}
						>
							<Trash2Icon aria-hidden="true" className="size-4" />
							削除する
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
			<Dialog.Root open={unpublishOpen} onOpenChange={onUnpublishOpenChange} role="alertdialog">
				<Dialog className="grid gap-4 p-5">
					<Dialog.Title>公開を取り消しますか？</Dialog.Title>
					<Dialog.Description>
						「{newsTitle}」を下書きに戻します。外部ページには表示されなくなります。
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="secondary" onClick={() => onUnpublishOpenChange(false)}>
							<XIcon aria-hidden="true" className="size-4" />
							キャンセル
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={pending}
							loading={pending}
							onClick={onUnpublish}
						>
							<Undo2Icon aria-hidden="true" className="size-4" />
							下書きに戻す
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</>
	);
}
