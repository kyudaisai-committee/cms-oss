"use client";

import { Badge, Text } from "@cloudflare/kumo";

import type { NewsFormState } from "../store";
import { areNewsFormStatesEqual } from "./news-form-storage";

interface NewsFormSyncStatusProps {
	draftBaseFingerprint: string | null;
	serverBaseState: NewsFormState;
	serverFingerprint: string | null;
	values: NewsFormState;
}

export function NewsFormSyncStatus({
	draftBaseFingerprint,
	serverBaseState,
	serverFingerprint,
	values,
}: NewsFormSyncStatusProps) {
	const hasUnsavedChanges = !areNewsFormStatesEqual(values, serverBaseState);
	const hasServerConflict =
		draftBaseFingerprint !== null &&
		serverFingerprint !== null &&
		draftBaseFingerprint !== serverFingerprint;
	if (!hasUnsavedChanges && !hasServerConflict) return null;

	return (
		<div aria-live="polite" className="grid gap-2">
			{hasUnsavedChanges ? <Badge variant="warning">未保存の変更あり</Badge> : null}
			{hasServerConflict ? (
				<Text as="p" role="alert" size="base" variant="error">
					サーバー側で別の更新が検出されました。内容を確認してから保存してください。
				</Text>
			) : null}
		</div>
	);
}
