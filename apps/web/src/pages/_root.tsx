import type { ReactNode } from "react";

import { THEME_STORAGE_KEY } from "#web/components/theme";

interface RootElementProps {
	children: ReactNode;
}

const themeStorageKey = JSON.stringify(THEME_STORAGE_KEY);

const themeInitializationScript = `(function () {
  var root = document.documentElement;
  var mode = "light";
  try {
    mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {}
  try {
    var stored = window.localStorage.getItem(${themeStorageKey});
    if (stored === "light" || stored === "dark") mode = stored;
  } catch {}
  root.dataset.theme = "kumo";
  root.dataset.mode = mode;
})();`;

export default async function RootElement({ children }: RootElementProps) {
	return (
		<html lang="ja" data-theme="kumo" data-mode="light" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
			</head>
			<body>{children}</body>
		</html>
	);
}

export async function getConfig() {
	return { render: "static" } as const;
}
