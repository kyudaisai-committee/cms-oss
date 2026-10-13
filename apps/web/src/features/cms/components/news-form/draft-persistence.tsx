import { useEffect } from "react";

import type { NewsFormState } from "../../store";
import {
	areNewsFormStatesEqual,
	persistNewsFormDraft,
	removeNewsFormDraft,
	serializeNewsFormState,
} from "../news-form-storage";

export function NewsFormDraftPersistence({
	baseState,
	controllerRef,
	onSynchronized,
	ready,
	skipFingerprintRef,
	storageKey,
	values,
}: {
	baseState: NewsFormState;
	controllerRef: { current: AbortController | null };
	onSynchronized: (value: null) => void;
	ready: boolean;
	skipFingerprintRef: { current: string | null };
	storageKey: string;
	values: NewsFormState;
}) {
	useEffect(() => {
		if (!ready) return;
		const fingerprint = serializeNewsFormState(values);
		if (skipFingerprintRef.current === fingerprint) {
			skipFingerprintRef.current = null;
			return;
		}
		if (areNewsFormStatesEqual(values, baseState)) {
			removeNewsFormDraft(storageKey);
			onSynchronized(null);
			return;
		}
		const controller = new AbortController();
		controllerRef.current?.abort();
		controllerRef.current = controller;
		void persistNewsFormDraft(storageKey, values, baseState, undefined, controller.signal);
		return () => {
			controller.abort();
			if (controllerRef.current === controller) controllerRef.current = null;
		};
	}, [baseState, controllerRef, onSynchronized, ready, skipFingerprintRef, storageKey, values]);

	return null;
}
