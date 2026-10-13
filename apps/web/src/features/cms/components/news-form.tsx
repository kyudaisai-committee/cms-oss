"use client";

import { Text, useKumoToastManager } from "@cloudflare/kumo";
import { Provider, useAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "waku";

import { StatusMessage } from "#web/components/status-message";
import { scopePath } from "#web/features/cms/site";
import type { AdminNewsDto, ScopeRef, TagDto } from "@repo/core/types";

import {
	createNews,
	createNewsTranslation,
	deleteNews,
	publishNewsTranslation,
	unpublishNewsTranslation,
	updateNewsParent,
	updateNewsTranslation,
} from "../api";
import { cmsErrorAtom, cmsPendingAtom, selectedScopeAtom, tagsAtom } from "../store";
import type { NewsFormState } from "../store";
import {
	createNewsFormState,
	toNewsInput,
	toNewsTranslationInput,
	validateNewsForm,
} from "./news-form-model";
import { NewsFormSyncStatus } from "./news-form-status";
import {
	getNewsFormDraftStorageKeyForLanguage,
	getLegacyNewsFormDraftStorageKey,
	getNewsFormFingerprint,
	readNewsFormDraft,
	removeNewsFormDraft,
	serializeNewsFormState,
} from "./news-form-storage";
import { NewsFormActions } from "./news-form/actions";
import { NewsContentSection } from "./news-form/content-section";
import { NewsDetailsSection } from "./news-form/details-section";
import { NewsFormDialogs } from "./news-form/dialogs";
import { NewsFormDraftPersistence } from "./news-form/draft-persistence";
import { useNewsForm } from "./news-form/form";
import { NewsLanguageTabs } from "./news-form/language-tabs";
import { NewsPublicationSummary } from "./news-form/publication-summary";

export interface NewsFormProps {
	scope: ScopeRef;
	scopeName: string;
	tags: TagDto[];
	news?: AdminNewsDto | undefined;
	availableLanguages?: string[] | undefined;
	defaultLanguage?: string | undefined;
	initialSlug?: string | undefined;
	initialLang?: string | undefined;
	translationMissing?: boolean | undefined;
}

export function NewsForm(props: NewsFormProps) {
	return (
		<Provider>
			<NewsFormStateHydrator scope={props.scope} tags={props.tags}>
				<NewsFormContent {...props} />
			</NewsFormStateHydrator>
		</Provider>
	);
}

function NewsFormStateHydrator({
	children,
	scope,
	tags,
}: {
	children: ReactNode;
	scope: ScopeRef;
	tags: TagDto[];
}) {
	useHydrateAtoms([
		[selectedScopeAtom, scope],
		[tagsAtom, tags],
	] as const);
	return children;
}

function NewsFormContent({
	scope,
	scopeName,
	tags,
	news,
	availableLanguages,
	defaultLanguage,
	initialSlug,
	initialLang,
	translationMissing,
}: NewsFormProps) {
	const router = useRouter();
	const [, setSelectedScope] = useAtom(selectedScopeAtom);
	const [pending, setPending] = useAtom(cmsPendingAtom);
	const [error, setError] = useAtom(cmsErrorAtom);
	const [currentNews, setCurrentNews] = useState(news);
	const [publishOpen, setPublishOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [unpublishOpen, setUnpublishOpen] = useState(false);
	const publishIntent = useRef(false);
	const toast = useKumoToastManager();
	const parentId = currentNews?.id ?? news?.id;
	const isEdit = parentId !== undefined;
	const isAlreadyPublished = !translationMissing && currentNews?.status === "published";
	const activeLang = initialLang ?? currentNews?.lang ?? defaultLanguage ?? "ja";
	const [serverBaseState, setServerBaseState] = useState(() =>
		createNewsFormState(news, {
			slug: initialSlug,
			lang: initialLang ?? defaultLanguage,
			blank: translationMissing,
		}),
	);
	const form = useNewsForm(serverBaseState, async (value) => {
		const shouldPublish = publishIntent.current;
		publishIntent.current = false;
		await save(value, shouldPublish);
	});
	const draftStorageKey = getNewsFormDraftStorageKeyForLanguage(
		scope,
		parentId ?? (initialSlug ? `${initialSlug}:${activeLang}` : undefined),
		activeLang,
	);
	const [draftReady, setDraftReady] = useState(false);
	const [editorInstanceKey, setEditorInstanceKey] = useState(0);
	const [draftBaseFingerprint, setDraftBaseFingerprint] = useState<string | null>(null);
	const [serverFingerprint, setServerFingerprint] = useState<string | null>(null);
	const draftPersistenceControllerRef = useRef<AbortController | null>(null);
	const draftPersistenceSkipFingerprintRef = useRef<string | null>(null);

	const resetToServerState = (state: NewsFormState) => {
		draftPersistenceControllerRef.current?.abort();
		draftPersistenceControllerRef.current = null;
		draftPersistenceSkipFingerprintRef.current = serializeNewsFormState(state);
		form.reset(state);
	};

	useEffect(() => {
		setCurrentNews(news);
		const nextState = createNewsFormState(news, {
			slug: initialSlug,
			lang: initialLang ?? defaultLanguage,
			blank: translationMissing,
		});
		setServerBaseState(nextState);
		resetToServerState(nextState);
	}, [defaultLanguage, news?.id, initialSlug, initialLang, translationMissing]);

	useEffect(() => {
		let cancelled = false;
		setServerFingerprint(null);
		void getNewsFormFingerprint(serverBaseState).then((fingerprint) => {
			if (!cancelled) setServerFingerprint(fingerprint);
		});
		return () => {
			cancelled = true;
		};
	}, [serverBaseState]);

	useEffect(() => {
		const draft =
			readNewsFormDraft(draftStorageKey) ??
			(news ? readNewsFormDraft(getLegacyNewsFormDraftStorageKey(scope, news.id)) : null);
		if (draft) {
			form.reset(draft.state, { keepDefaultValues: true });
			setDraftBaseFingerprint(draft.baseFingerprint);
			setEditorInstanceKey((current) => current + 1);
		} else {
			setDraftBaseFingerprint(null);
		}
		setDraftReady(true);
	}, [draftStorageKey, form]);

	async function save(values: NewsFormState, publish: boolean) {
		const validationMessages = validateNewsForm(values);
		if (validationMessages.length > 0) {
			setError(validationMessages.join(" "));
			return;
		}
		setPending(true);
		setError(null);
		try {
			const input = toNewsInput(values);
			const translationInput = toNewsTranslationInput(values);
			let saved: AdminNewsDto;
			const wasEditing = parentId !== undefined;
			if (!wasEditing) {
				saved = await createNews(scope, input);
			} else {
				await updateNewsParent(scope, parentId, { slug: input.slug, tagIds: input.tagIds });
				const hasTranslation = currentNews?.translations?.some(
					(translation) => translation.lang === activeLang,
				);
				saved =
					translationMissing || hasTranslation === false
						? await createNewsTranslation(scope, parentId, activeLang, translationInput)
						: await updateNewsTranslation(scope, parentId, activeLang, translationInput);
			}
			const savedState = createNewsFormState(saved);
			setSelectedScope(scope);
			setCurrentNews(saved);
			setServerBaseState(savedState);
			setDraftBaseFingerprint(null);
			resetToServerState(savedState);
			removeNewsFormDraft(draftStorageKey);
			if (publish) {
				const published = await publishNewsTranslation(
					scope,
					saved.id,
					activeLang,
					input.publishedAt ?? undefined,
				);
				const publishedState = createNewsFormState(published);
				setCurrentNews(published);
				setServerBaseState(publishedState);
				setDraftBaseFingerprint(null);
				resetToServerState(publishedState);
				removeNewsFormDraft(draftStorageKey);
			}
			toast.add({
				title: publish
					? "お知らせを保存して公開しました。"
					: isEdit
						? "お知らせを更新しました。"
						: "お知らせを作成しました。",
				variant: "success",
			});
			if (!wasEditing)
				void router.replace(
					`${scopePath(scope)}/${encodeURIComponent(saved.id)}?lang=${encodeURIComponent(activeLang)}`,
				);
		} catch (cause) {
			const nextMessage = cause instanceof Error ? cause.message : "保存できませんでした。";
			setError(nextMessage);
			toast.add({
				description: nextMessage,
				title: "お知らせを保存できませんでした。",
				variant: "error",
			});
		} finally {
			setPending(false);
		}
	}

	const remove = async () => {
		if (!currentNews) return;
		setPending(true);
		setError(null);
		try {
			await deleteNews(scope, parentId ?? currentNews.id);
			removeNewsFormDraft(draftStorageKey);
			toast.add({
				title: "お知らせを削除しました。",
				variant: "success",
			});
			void router.push(scopePath(scope));
		} catch (cause) {
			const nextMessage = cause instanceof Error ? cause.message : "削除できませんでした。";
			setError(nextMessage);
			toast.add({
				description: nextMessage,
				title: "お知らせを削除できませんでした。",
				variant: "error",
			});
			setDeleteOpen(false);
		} finally {
			setPending(false);
		}
	};

	const unpublish = async () => {
		if (!currentNews || currentNews.status !== "published") return;
		setPending(true);
		setError(null);
		try {
			const updated = await unpublishNewsTranslation(scope, parentId ?? currentNews.id, activeLang);
			const updatedState = createNewsFormState(updated);
			setCurrentNews(updated);
			setServerBaseState(updatedState);
			setDraftBaseFingerprint(null);
			resetToServerState(updatedState);
			removeNewsFormDraft(draftStorageKey);
			setUnpublishOpen(false);
			toast.add({
				title: "お知らせを下書きに戻しました。",
				variant: "success",
			});
		} catch (cause) {
			const nextMessage = cause instanceof Error ? cause.message : "公開を取り消せませんでした。";
			setError(nextMessage);
			toast.add({
				description: nextMessage,
				title: "公開を取り消せませんでした。",
				variant: "error",
			});
		} finally {
			setPending(false);
		}
	};

	const submitPublish = async () => {
		publishIntent.current = true;
		try {
			await form.handleSubmit();
		} finally {
			publishIntent.current = false;
		}
	};

	return (
		<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
			<div className="mb-7 flex flex-col gap-2">
				<Text as="p" variant="secondary" size="base">
					{scopeName}
				</Text>
				<Text as="h1" variant="heading" size="lg">
					{isEdit ? "お知らせを編集" : "新しいお知らせ"}
				</Text>
				<Text variant="secondary" size="base">
					{isEdit ? "内容を更新して保存できます。" : "公開するお知らせの内容を入力します。"}
				</Text>
			</div>

			<NewsLanguageTabs
				activeLang={activeLang}
				availableLanguages={availableLanguages}
				currentNews={currentNews}
				initialSlug={initialSlug}
				parentId={parentId}
				scope={scope}
				translationMissing={translationMissing}
			/>

			{error ? (
				<StatusMessage className="mb-5" tone="error">
					{error}
				</StatusMessage>
			) : null}

			<form
				autoComplete="off"
				className="grid gap-5"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					publishIntent.current = false;
					void form.handleSubmit();
				}}
			>
				<form.Subscribe selector={(state) => state.values}>
					{(values) => (
						<NewsFormDraftPersistence
							baseState={serverBaseState}
							controllerRef={draftPersistenceControllerRef}
							onSynchronized={setDraftBaseFingerprint}
							ready={draftReady}
							skipFingerprintRef={draftPersistenceSkipFingerprintRef}
							storageKey={draftStorageKey}
							values={values}
						/>
					)}
				</form.Subscribe>
				<NewsDetailsSection activeLang={activeLang} form={form} tags={tags} />
				<NewsContentSection editorInstanceKey={editorInstanceKey} form={form} scope={scope} />
				{currentNews ? (
					<NewsPublicationSummary
						news={currentNews}
						pending={pending}
						onUnpublish={() => setUnpublishOpen(true)}
					/>
				) : null}
				<form.Subscribe selector={(state) => state.values}>
					{(values) => (
						<NewsFormSyncStatus
							draftBaseFingerprint={draftBaseFingerprint}
							serverBaseState={serverBaseState}
							serverFingerprint={serverFingerprint}
							values={values}
						/>
					)}
				</form.Subscribe>

				<NewsFormActions
					isAlreadyPublished={isAlreadyPublished}
					isEdit={isEdit}
					pending={pending}
					onDeleteRequest={() => setDeleteOpen(true)}
					onPublishRequest={() => setPublishOpen(true)}
				/>
			</form>

			<NewsFormDialogs
				deleteOpen={deleteOpen}
				newsTitle={currentNews?.title}
				onDelete={() => void remove()}
				onDeleteOpenChange={setDeleteOpen}
				onPublish={() => void submitPublish()}
				onPublishOpenChange={setPublishOpen}
				onUnpublish={() => void unpublish()}
				onUnpublishOpenChange={setUnpublishOpen}
				pending={pending}
				publishOpen={publishOpen}
				unpublishOpen={unpublishOpen}
			/>
		</section>
	);
}
