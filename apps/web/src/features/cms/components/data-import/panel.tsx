"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { executeDataImport, previewDataImport } from "#web/features/cms/api";
import type { ScopeDto } from "@repo/core/types";
import type { DataImportResult, DataImportTargetCurrent } from "@repo/core/types";

import {
	applyDataImportLanguageAction,
	applyDataImportLanguageTarget,
	applyDataImportNewsAction,
	buildDataImportRequest,
	createDataImportDraft,
	getDataImportRequestFingerprint,
	getDataImportSource,
	isDataImportCommitReady,
	reconcileDataImportLanguageChoices,
	updateDataImportManualSlug,
} from "../../data-import-model";
import type {
	DataImportEditingDraft,
	DataImportOriginal,
	DataImportReadonly,
	DataImportServerApproval,
} from "../../data-import-model";
import {
	getDataImportErrorMessage,
	parseDataImportText,
	snapshotDataImportTarget,
} from "../../data-import-model";
import { DataImportOperationGate } from "../../data-import-operations";
import { planDataImportDraft } from "../../data-import/plan";
import { DataImportPanelView } from "./panel-view";

export interface DataImportPanelProps {
	scope: ScopeDto;
}

function requestFingerprint(draft: DataImportEditingDraft) {
	return getDataImportRequestFingerprint(buildDataImportRequest(draft));
}

function errorMessage(cause: unknown) {
	return cause instanceof Error
		? cause.message
		: "取り込み先の状態を確認できませんでした。もう一度お試しください。";
}

export function DataImportPanel({ scope }: DataImportPanelProps) {
	const [original, setOriginal] = useState<DataImportOriginal | null>(null);
	const [targetCurrent, setTargetCurrent] =
		useState<DataImportReadonly<DataImportTargetCurrent> | null>(null);
	const [editingDraftState, setEditingDraftState] = useState<DataImportEditingDraft | null>(null);
	const [sourceIndex, setSourceIndex] = useState("");
	const [isReading, setIsReading] = useState(false);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<DataImportResult | null>(null);
	const [serverApproval, setServerApproval] = useState<DataImportServerApproval | null>(null);
	const [refreshRevision, setRefreshRevision] = useState(0);
	const editingDraftRef = useRef<DataImportEditingDraft | null>(null);
	const currentTargetRef = useRef<DataImportReadonly<DataImportTargetCurrent> | null>(null);
	const operationGate = useRef(new DataImportOperationGate());
	const commitGeneration = useRef(0);
	const nextDraftId = useRef(0);

	function setEditingDraft(draft: DataImportEditingDraft | null) {
		editingDraftRef.current = draft;
		setEditingDraftState(draft);
	}

	function setCurrentTarget(target: DataImportReadonly<DataImportTargetCurrent> | null) {
		currentTargetRef.current = target;
		setTargetCurrent(target);
	}

	function updateDraft(change: (draft: DataImportEditingDraft) => DataImportEditingDraft) {
		const current = editingDraftRef.current;
		if (!current) return;
		const next = change(current);
		if (next === current) return;
		operationGate.current.invalidatePreview();
		setServerApproval(null);
		setEditingDraft(next);
		setError(null);
		setResult(null);
	}

	async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0] ?? null;
		const generation = operationGate.current.beginFileRead();
		event.currentTarget.value = "";
		commitGeneration.current += 1;
		setOriginal(null);
		setEditingDraft(null);
		setServerApproval(null);
		setSourceIndex("");
		setIsImporting(false);
		setIsPreviewing(false);
		setIsReading(Boolean(file));
		setError(null);
		setResult(null);
		if (!file) return;

		try {
			const rawText = await file.text();
			if (!operationGate.current.isCurrentFileRead(generation)) return;
			const parsed = parseDataImportText(rawText);
			if (!parsed.success) {
				setError(getDataImportErrorMessage(parsed.error));
				return;
			}
			setOriginal(parsed.original);
		} catch {
			if (operationGate.current.isCurrentFileRead(generation))
				setError("ファイルを読み取れませんでした。もう一度選択してください。");
		} finally {
			if (operationGate.current.isCurrentFileRead(generation)) setIsReading(false);
		}
	}

	function handleSourceChange(indexValue: string) {
		operationGate.current.invalidatePreview();
		setSourceIndex(indexValue);
		setServerApproval(null);
		setError(null);
		setResult(null);
		const source = original ? getDataImportSource(original, indexValue) : undefined;
		if (!source) {
			setEditingDraft(null);
			return;
		}
		setEditingDraft(createDataImportDraft(source, Number(indexValue), ++nextDraftId.current));
	}

	useEffect(() => {
		const draft = editingDraftState;
		if (!draft) return;
		const request = buildDataImportRequest(draft);
		const fingerprint = getDataImportRequestFingerprint(request);
		const ticket = operationGate.current.beginPreview(draft.id);
		setServerApproval((current) => (current?.requestFingerprint === fingerprint ? current : null));
		setIsPreviewing(true);
		const timeout = setTimeout(() => {
			void previewDataImport(scope, request)
				.then((response) => {
					const activeDraft = editingDraftRef.current;
					if (!operationGate.current.isCurrentPreview(ticket, activeDraft?.id)) return;
					if (!activeDraft || requestFingerprint(activeDraft) !== fingerprint) return;
					const target = snapshotDataImportTarget(response.targetCurrent);
					setCurrentTarget(target);
					const reconciledDraft = reconcileDataImportLanguageChoices(
						activeDraft,
						target.scope.availableLanguages,
					);
					if (reconciledDraft !== activeDraft) {
						setServerApproval(null);
						setEditingDraft(reconciledDraft);
						setError(null);
						return;
					}
					const localPlan = planDataImportDraft(activeDraft, target);
					if (JSON.stringify(localPlan.plan) !== JSON.stringify(response.plan)) {
						setServerApproval(null);
						setError("プレビュー内容を一致させられませんでした。入力を見直してください。");
						return;
					}
					setServerApproval({
						requestFingerprint: fingerprint,
						previewToken: response.previewToken,
					});
					setError(null);
				})
				.catch((cause: unknown) => {
					const activeDraft = editingDraftRef.current;
					if (!operationGate.current.isCurrentPreview(ticket, activeDraft?.id)) return;
					if (!activeDraft || requestFingerprint(activeDraft) !== fingerprint) return;
					setServerApproval(null);
					setError(errorMessage(cause));
				})
				.finally(() => {
					const activeDraft = editingDraftRef.current;
					if (operationGate.current.isCurrentPreview(ticket, activeDraft?.id))
						setIsPreviewing(false);
				});
		}, 250);

		return () => {
			clearTimeout(timeout);
			operationGate.current.invalidatePreview();
		};
	}, [editingDraftState, refreshRevision, scope.site, scope.year]);

	async function handleImport() {
		const draft = editingDraftRef.current;
		const approval = serverApproval;
		const target = currentTargetRef.current;
		if (!draft || !approval || !target) return;
		const request = buildDataImportRequest(draft);
		const localPlan = planDataImportDraft(draft, target);
		if (!isDataImportCommitReady(localPlan.plan.ready, approval, request)) return;
		const generation = ++commitGeneration.current;
		operationGate.current.invalidatePreview();
		setServerApproval(null);
		setIsPreviewing(false);
		setIsImporting(true);
		setError(null);
		setResult(null);
		try {
			const imported = await executeDataImport(scope, {
				...request,
				expectedPreviewToken: approval.previewToken,
			});
			if (generation !== commitGeneration.current || editingDraftRef.current?.id !== draft.id)
				return;
			setCurrentTarget(snapshotDataImportTarget(imported.targetCurrent));
			setResult(imported);
			setRefreshRevision((revision) => revision + 1);
		} catch (cause) {
			if (generation !== commitGeneration.current) return;
			setError(errorMessage(cause));
			setRefreshRevision((revision) => revision + 1);
		} finally {
			if (generation === commitGeneration.current) setIsImporting(false);
		}
	}

	const currentRequest = editingDraftState ? buildDataImportRequest(editingDraftState) : null;
	const localPlan = useMemo(() => {
		return editingDraftState && targetCurrent
			? planDataImportDraft(editingDraftState, targetCurrent)
			: null;
	}, [editingDraftState, targetCurrent]);
	const commitReady = Boolean(
		localPlan &&
		currentRequest &&
		isDataImportCommitReady(localPlan.plan.ready, serverApproval, currentRequest),
	);

	return (
		<DataImportPanelView
			scope={scope}
			original={original}
			targetCurrent={targetCurrent}
			editingDraft={editingDraftState}
			sourceIndex={sourceIndex}
			isReading={isReading}
			isPreviewing={isPreviewing}
			isImporting={isImporting}
			commitReady={commitReady}
			error={error}
			result={result}
			onFileChange={(event) => void handleFileChange(event)}
			onSourceChange={handleSourceChange}
			onImport={() => void handleImport()}
			onNewsDecisionChange={(newsIndex, action) =>
				updateDraft((draft) => {
					const target = currentTargetRef.current;
					return applyDataImportNewsAction(
						draft,
						newsIndex,
						action,
						target?.scope.availableLanguages ?? [],
					);
				})
			}
			onManualSlugChange={(newsIndex, slug) =>
				updateDraft((draft) => updateDataImportManualSlug(draft, newsIndex, slug))
			}
			onLanguageActionChange={(sourceLanguage, action) =>
				updateDraft((draft) => applyDataImportLanguageAction(draft, sourceLanguage, action))
			}
			onLanguageTargetChange={(sourceLanguage, targetLanguage) =>
				updateDraft((draft) => applyDataImportLanguageTarget(draft, sourceLanguage, targetLanguage))
			}
		/>
	);
}
