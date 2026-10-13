"use client";

import { useForm } from "@tanstack/react-form";

import type { NewsFormState } from "../../store";

export function useNewsForm(
	defaultValues: NewsFormState,
	onSubmit: (values: NewsFormState) => void | Promise<void>,
) {
	return useForm({
		defaultValues,
		onSubmit: ({ value }) => onSubmit(value),
	});
}

export type NewsFormApi = ReturnType<typeof useNewsForm>;
