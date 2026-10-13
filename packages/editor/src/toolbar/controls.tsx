import { Button, Tooltip } from "@cloudflare/kumo";
import { $setBlocksType } from "@lexical/selection";
import { $getSelection, $isRangeSelection, type ElementNode, type LexicalEditor } from "lexical";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface ToolbarButtonProps {
	label: string;
	icon?: LucideIcon;
	children?: ReactNode;
	disabled?: boolean;
	active?: boolean | undefined;
	onClick: () => void;
}

export function ToolbarButton({
	label,
	icon: Icon,
	children,
	disabled,
	active,
	onClick,
}: ToolbarButtonProps) {
	const commonProps = {
		"aria-label": label,
		"aria-pressed": active,
		disabled,
		onClick,
		size: "sm" as const,
		variant: (active ? "secondary" : "ghost") as "secondary" | "ghost",
		title: label,
		type: "button" as const,
	};
	if (children) {
		return (
			<Tooltip
				content={label}
				render={
					<Button {...commonProps} shape="base">
						{Icon && <Icon aria-hidden="true" className="size-4" />}
						{children}
					</Button>
				}
			/>
		);
	}
	return (
		<Tooltip
			content={label}
			render={
				<Button {...commonProps} shape="square">
					{Icon && <Icon aria-hidden="true" className="size-4" />}
				</Button>
			}
		/>
	);
}

interface BlockTypeButtonProps {
	label: string;
	icon: LucideIcon;
	active?: boolean | undefined;
	onClick: () => void;
}

export function BlockTypeButton({ label, icon, active, onClick }: BlockTypeButtonProps) {
	return <ToolbarButton active={active} label={label} icon={icon} onClick={onClick} />;
}

export function $updateSelectedBlocks<T extends ElementNode>(
	editor: LexicalEditor,
	createNode: () => T,
) {
	editor.update(() => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) $setBlocksType(selection, createNode);
	});
}
