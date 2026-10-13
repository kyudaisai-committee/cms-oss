"use client";

import {
	Badge,
	Button,
	ClipboardText,
	Input,
	LayerCard,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { UploadIcon } from "lucide-react";
import { useState } from "react";

import { StatusMessage } from "#web/components/status-message";
import type { AssetDto, ScopeRef } from "@repo/core/types";

import { CmsApiError, getAssetPath, uploadAsset } from "../api";

interface AssetUploadPanelProps {
	scope: ScopeRef;
}

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeMarkdownLabel(label: string) {
	return label.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
}

export function AssetUploadPanel({ scope }: AssetUploadPanelProps) {
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [asset, setAsset] = useState<AssetDto | null>(null);
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const toast = useKumoToastManager();
	const assetPath = asset ? getAssetPath(scope, asset.id) : "";
	const label = asset ? escapeMarkdownLabel(asset.filename) : "";
	const snippet = asset
		? asset.mimeType.startsWith("image/")
			? `![${label}](${assetPath})`
			: `[${label}](${assetPath})`
		: "";

	const handleUpload = async () => {
		if (!selectedFile) return;
		setPending(true);
		setMessage(null);
		try {
			setAsset(await uploadAsset(scope, selectedFile));
			setSelectedFile(null);
			setMessage("アセットをアップロードしました。Markdown snippetを利用できます。");
			toast.add({
				description: "Markdown snippetを利用できます。",
				title: "アセットをアップロードしました。",
				variant: "success",
			});
		} catch (cause) {
			const nextMessage =
				cause instanceof CmsApiError ? cause.message : "アップロードできませんでした。";
			setMessage(nextMessage);
			toast.add({
				description: nextMessage,
				title: "アップロードできませんでした。",
				variant: "error",
			});
		} finally {
			setPending(false);
		}
	};

	return (
		<LayerCard className="grid gap-4 p-5">
			<div className="flex flex-col gap-1">
				<Text as="h2" variant="heading" size="lg">
					アセットをアップロード
				</Text>
				<Text variant="secondary" size="base">
					画像や添付ファイルをR2に保存し、Markdown snippetを取得します。
				</Text>
			</div>
			<Input
				autoComplete="off"
				aria-label="アップロードするファイル"
				label="ファイル"
				type="file"
				onChange={(event) => {
					setSelectedFile(event.target.files?.[0] ?? null);
					setAsset(null);
					setMessage(null);
				}}
			/>
			{selectedFile ? (
				<Text variant="secondary" size="base">
					{selectedFile.name} · {selectedFile.type || "application/octet-stream"} ·{" "}
					{formatBytes(selectedFile.size)}
				</Text>
			) : null}
			<Button
				disabled={!selectedFile || pending}
				loading={pending}
				onClick={() => void handleUpload()}
				variant="secondary"
			>
				<UploadIcon aria-hidden="true" className="size-4" />
				アップロード
			</Button>
			{message ? <StatusMessage>{message}</StatusMessage> : null}
			{asset ? (
				<div className="grid gap-2">
					<div className="flex items-center gap-2">
						<Badge variant="success">アップロード完了</Badge>
						<Text variant="secondary" size="base">
							{formatBytes(asset.size)}
						</Text>
					</div>
					<ClipboardText
						labels={{ copyAction: "Markdown snippetをコピー" }}
						text={snippet}
						tooltip={{ copiedText: "コピーしました。", text: "コピー" }}
					/>
				</div>
			) : null}
		</LayerCard>
	);
}
