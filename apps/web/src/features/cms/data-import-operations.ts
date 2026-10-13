export type DataImportPreviewTicket = Readonly<{
	draftId: number;
	revision: number;
}>;

export class DataImportOperationGate {
	private fileRevision = 0;
	private previewRevision = 0;

	beginFileRead(): number {
		this.fileRevision += 1;
		this.previewRevision += 1;
		return this.fileRevision;
	}

	isCurrentFileRead(revision: number): boolean {
		return revision === this.fileRevision;
	}

	beginPreview(draftId: number): DataImportPreviewTicket {
		this.previewRevision += 1;
		return { draftId, revision: this.previewRevision };
	}

	invalidatePreview(): void {
		this.previewRevision += 1;
	}

	isCurrentPreview(ticket: DataImportPreviewTicket, activeDraftId: number | undefined): boolean {
		return ticket.revision === this.previewRevision && ticket.draftId === activeDraftId;
	}
}
