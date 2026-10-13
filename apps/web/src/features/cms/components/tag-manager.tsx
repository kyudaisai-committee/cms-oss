"use client";

import {
	Badge,
	Button,
	Dialog,
	Input,
	LayerCard,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { useForm } from "@tanstack/react-form";
import { useAtom } from "jotai";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";

import { StatusMessage } from "#web/components/status-message";
import type { ScopeRef, TagDto } from "@repo/core/types";

import { createTag, deleteTag } from "../api";
import { cmsErrorAtom, cmsPendingAtom, tagsAtom } from "../store";

import styles from "./tag-manager.module.css";

interface TagManagerProps {
	scope: ScopeRef;
	initialTags: TagDto[];
}

export function TagManager({ scope, initialTags }: TagManagerProps) {
	const [tags, setTags] = useAtom(tagsAtom);
	const [pending, setPending] = useAtom(cmsPendingAtom);
	const [, setCmsError] = useAtom(cmsErrorAtom);
	const [message, setMessage] = useState<string | null>(null);
	const [tagToDelete, setTagToDelete] = useState<TagDto | null>(null);
	const [tagDeleteOpen, setTagDeleteOpen] = useState(false);
	const toast = useKumoToastManager();
	const visibleTags = tags.length > 0 || initialTags.length === 0 ? tags : initialTags;
	const form = useForm({
		defaultValues: { name: "", slug: "" },
		onSubmit: async ({ value }) => {
			setPending(true);
			setCmsError(null);
			setMessage(null);
			try {
				const created = await createTag(scope, value);
				setTags((current) => [...current.filter((tag) => tag.id !== created.id), created]);
				form.reset();
				setMessage("タグを作成しました。");
				toast.add({ title: "タグを作成しました。", variant: "success" });
			} catch (cause) {
				const nextMessage = cause instanceof Error ? cause.message : "タグを作成できませんでした。";
				setCmsError(nextMessage);
				setMessage(nextMessage);
				toast.add({
					description: nextMessage,
					title: "タグを作成できませんでした。",
					variant: "error",
				});
			} finally {
				setPending(false);
			}
		},
	});

	const requestTagDelete = (tag: TagDto) => {
		setTagToDelete(tag);
		setTagDeleteOpen(true);
	};

	const removeTag = async () => {
		if (!tagToDelete) return;
		setPending(true);
		setCmsError(null);
		setMessage(null);
		try {
			await deleteTag(scope, tagToDelete.id);
			setTags((current) => current.filter((item) => item.id !== tagToDelete.id));
			setTagDeleteOpen(false);
			setMessage("タグを削除しました。");
			toast.add({ title: "タグを削除しました。", variant: "success" });
		} catch (cause) {
			const nextMessage = cause instanceof Error ? cause.message : "タグを削除できませんでした。";
			setCmsError(nextMessage);
			setMessage(nextMessage);
			toast.add({
				description: nextMessage,
				title: "タグを削除できませんでした。",
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
					タグ
				</Text>
				<Text variant="secondary" size="base">
					絞り込みに使うタグを管理します。
				</Text>
			</div>
			<form
				autoComplete="off"
				className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.Field
					name="name"
					validators={{
						onChange: ({ value }) => (value.trim() ? undefined : "タグ名を入力してください。"),
						onSubmit: ({ value }) => (value.trim() ? undefined : "タグ名を入力してください。"),
					}}
				>
					{(field) => (
						<Input
							autoComplete="off"
							aria-label="タグ名"
							aria-invalid={field.state.meta.errors[0] !== undefined}
							{...(field.state.meta.errors[0] ? { error: field.state.meta.errors[0] } : {})}
							label="名前"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(event) => {
								setMessage(null);
								setCmsError(null);
								field.handleChange(event.target.value);
							}}
						/>
					)}
				</form.Field>
				<form.Field
					name="slug"
					validators={{
						onChange: ({ value }) =>
							/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim())
								? undefined
								: "slugは半角英数字とハイフンで入力してください。",
						onSubmit: ({ value }) =>
							/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim())
								? undefined
								: "slugは半角英数字とハイフンで入力してください。",
					}}
				>
					{(field) => (
						<Input
							autoComplete="off"
							aria-label="タグslug"
							aria-invalid={field.state.meta.errors[0] !== undefined}
							{...(field.state.meta.errors[0] ? { error: field.state.meta.errors[0] } : {})}
							label="slug"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(event) => {
								setMessage(null);
								setCmsError(null);
								field.handleChange(event.target.value);
							}}
						/>
					)}
				</form.Field>
				<Button disabled={pending} loading={pending} type="submit" variant="secondary">
					<PlusIcon aria-hidden="true" className="size-4" />
					追加
				</Button>
			</form>
			{message ? <StatusMessage>{message}</StatusMessage> : null}
			{visibleTags.length === 0 ? (
				<Text variant="secondary" size="base">
					登録されたタグはありません。
				</Text>
			) : (
				<ul className="flex flex-wrap gap-2" aria-label="登録済みタグ">
					{visibleTags.map((tag) => (
						<li key={tag.id}>
							<button
								aria-haspopup="dialog"
								aria-label={`${tag.name}を削除`}
								className={styles.tagDeleteTrigger}
								type="button"
								onClick={() => requestTagDelete(tag)}
							>
								<Badge appearance="dot" className={styles.tagDeleteBadge ?? ""} variant="neutral">
									{tag.name}
								</Badge>
							</button>
						</li>
					))}
				</ul>
			)}
			<Dialog.Root
				open={tagDeleteOpen}
				onOpenChange={(open) => {
					setTagDeleteOpen(open);
					if (!open) setTagToDelete(null);
				}}
				role="alertdialog"
			>
				<Dialog className="grid gap-4 p-5">
					<Dialog.Title>タグを削除しますか？</Dialog.Title>
					<Dialog.Description>
						「{tagToDelete?.name ?? ""}」を削除します。この操作は元に戻せません。
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="secondary" onClick={() => setTagDeleteOpen(false)}>
							<XIcon aria-hidden="true" className="size-4" />
							キャンセル
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={pending || !tagToDelete}
							loading={pending}
							onClick={() => void removeTag()}
						>
							<Trash2Icon aria-hidden="true" className="size-4" />
							削除する
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</LayerCard>
	);
}
