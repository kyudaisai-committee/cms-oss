import { cmsSettings } from "#web/cms-settings";

interface DocumentTitleProps {
	title?: string;
}

export function DocumentTitle({ title }: DocumentTitleProps) {
	const documentTitle = title ? `${title} | ${cmsSettings.name}` : cmsSettings.name;

	return <title>{documentTitle}</title>;
}
