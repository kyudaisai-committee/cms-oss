"use client";

import { Button, Text } from "@cloudflare/kumo";
import { useState } from "react";

import { StatusMessage } from "#web/components/status-message";
import { downloadDataExport } from "#web/features/cms/api";
import type { ScopeRef } from "@repo/core/types";

interface DataExportButtonProps {
	scope?: ScopeRef;
}

export function DataExportButton({ scope }: DataExportButtonProps) {
	const [isExporting, setIsExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const label = scope ? "このスコープをエクスポート" : "すべてのスコープをエクスポート";

	async function handleExport() {
		setIsExporting(true);
		setError(null);
		try {
			const blob = await downloadDataExport(scope);
			const downloadUrl = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = downloadUrl;
			anchor.download = "cms-export.json";
			anchor.click();
			window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "エクスポートできませんでした。しばらくしてから再度お試しください。",
			);
		} finally {
			setIsExporting(false);
		}
	}

	return (
		<div className="flex flex-col items-start gap-1.5">
			<Button disabled={isExporting} onClick={handleExport} type="button" variant="secondary">
				{isExporting ? "エクスポート中…" : label}
			</Button>
			<Text variant="secondary">画像ファイルは含まれません。</Text>
			{error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
		</div>
	);
}
