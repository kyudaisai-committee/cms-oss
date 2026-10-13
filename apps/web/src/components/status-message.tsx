import { Banner } from "@cloudflare/kumo";

interface StatusMessageProps {
	children: string;
	tone?: "error" | "info";
	className?: string;
}

export function StatusMessage({ children, tone = "info", className }: StatusMessageProps) {
	return (
		<Banner
			{...(className ? { className } : {})}
			role={tone === "error" ? "alert" : "status"}
			variant={tone === "error" ? "error" : "secondary"}
		>
			{children}
		</Banner>
	);
}
