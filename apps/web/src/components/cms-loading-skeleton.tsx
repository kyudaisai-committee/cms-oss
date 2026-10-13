import { LayerCard, Sidebar, SkeletonLine } from "@cloudflare/kumo";

const newsSkeletonRows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const scopeSkeletonRows = [0, 1, 2] as const;

export function ScopeSelectorSkeleton() {
	return (
		<section
			aria-busy="true"
			aria-label="スコープを読み込み中"
			className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-12"
			role="status"
		>
			<div className="mb-8 flex flex-col gap-2">
				<SkeletonLine minWidth={30} maxWidth={50} blockHeight={32} />
				<SkeletonLine minWidth={45} maxWidth={65} blockHeight={24} />
			</div>

			<LayerCard className="mb-6 grid gap-4 p-5">
				<div className="flex flex-col gap-1">
					<SkeletonLine minWidth={25} maxWidth={40} blockHeight={28} />
					<SkeletonLine minWidth={50} maxWidth={75} blockHeight={24} />
				</div>
				<div className="grid items-center gap-4 sm:grid-cols-2">
					<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
					<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
					<SkeletonLine className="sm:col-span-2" minWidth={70} maxWidth={90} blockHeight={56} />
					<div className="flex justify-end sm:col-span-2">
						<SkeletonLine minWidth={35} maxWidth={55} blockHeight={40} />
					</div>
				</div>
			</LayerCard>

			<div className="mb-5 flex flex-col gap-2 sm:max-w-sm">
				<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{scopeSkeletonRows.map((row) => (
					<LayerCard className="grid gap-2 p-5" key={row}>
						<SkeletonLine minWidth={45} maxWidth={65} blockHeight={28} />
						<SkeletonLine minWidth={35} maxWidth={55} blockHeight={24} />
						<SkeletonLine minWidth={45} maxWidth={60} blockHeight={40} />
					</LayerCard>
				))}
			</div>
		</section>
	);
}

export function ScopeNavigationSkeleton() {
	return (
		<Sidebar.MenuSub aria-busy="true" aria-label="スコープを読み込み中" role="status">
			{scopeSkeletonRows.map((row) => (
				<Sidebar.MenuSubItem key={row}>
					<div className="flex min-h-8.5 items-center rounded-lg px-3">
						<SkeletonLine minWidth={60} maxWidth={80} blockHeight={34} />
					</div>
				</Sidebar.MenuSubItem>
			))}
		</Sidebar.MenuSub>
	);
}

export function NewsListSkeleton() {
	return (
		<section
			aria-busy="true"
			aria-label="お知らせを読み込み中"
			className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10"
			role="status"
		>
			<div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex min-w-0 flex-col gap-2">
					<SkeletonLine minWidth={20} maxWidth={30} blockHeight={24} />
					<SkeletonLine minWidth={18} maxWidth={26} blockHeight={32} />
					<SkeletonLine minWidth={45} maxWidth={65} blockHeight={24} />
				</div>
				<SkeletonLine minWidth={28} maxWidth={38} blockHeight={40} />
			</div>

			<LayerCard className="mb-5 p-4">
				<div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
					<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
					<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
					<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
					<div className="md:w-28">
						<SkeletonLine minWidth={70} maxWidth={90} blockHeight={40} />
					</div>
				</div>
			</LayerCard>

			<LayerCard className="p-0">
				<div className="overflow-x-auto">
					<div className="min-w-4xl">
						<div className="grid grid-cols-[minmax(0,1fr)_5rem_10rem_minmax(0,1fr)_10rem_6rem]">
							<div className="border-kumo-fill border-b p-3">
								<SkeletonLine minWidth={35} maxWidth={55} blockHeight={24} />
							</div>
							<div className="border-kumo-fill border-b p-3">
								<SkeletonLine minWidth={55} maxWidth={75} blockHeight={24} />
							</div>
							<div className="border-kumo-fill border-b p-3">
								<SkeletonLine minWidth={30} maxWidth={50} blockHeight={24} />
							</div>
							<div className="border-kumo-fill border-b p-3">
								<SkeletonLine minWidth={45} maxWidth={65} blockHeight={24} />
							</div>
							<div className="border-kumo-fill border-b p-3">
								<SkeletonLine minWidth={45} maxWidth={65} blockHeight={24} />
							</div>
							<div className="border-kumo-fill border-b p-3">
								<SkeletonLine minWidth={35} maxWidth={55} blockHeight={24} />
							</div>
						</div>
						{newsSkeletonRows.map((row) => (
							<div
								className="grid grid-cols-[minmax(0,1fr)_5rem_10rem_minmax(0,1fr)_10rem_6rem]"
								key={row}
							>
								<div className="p-3">
									<div className="flex flex-col gap-2">
										<SkeletonLine minWidth={55} maxWidth={85} blockHeight={24} />
										<SkeletonLine minWidth={30} maxWidth={50} blockHeight={24} />
									</div>
								</div>
								<div className="p-3">
									<SkeletonLine minWidth={55} maxWidth={80} blockHeight={28} />
								</div>
								<div className="p-3">
									<SkeletonLine minWidth={35} maxWidth={65} blockHeight={28} />
								</div>
								<div className="p-3">
									<SkeletonLine minWidth={55} maxWidth={80} blockHeight={28} />
								</div>
								<div className="p-3">
									<SkeletonLine minWidth={50} maxWidth={75} blockHeight={24} />
								</div>
								<div className="p-3">
									<SkeletonLine minWidth={50} maxWidth={75} blockHeight={32} />
								</div>
							</div>
						))}
					</div>
				</div>
			</LayerCard>
			<div className="mt-4 flex justify-end">
				<SkeletonLine minWidth={55} maxWidth={75} blockHeight={40} />
			</div>
		</section>
	);
}

export function NewsFormSkeleton() {
	return (
		<section
			aria-busy="true"
			aria-label="お知らせフォームを読み込み中"
			className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10"
			role="status"
		>
			<div className="mb-7 flex flex-col gap-2">
				<SkeletonLine minWidth={20} maxWidth={30} blockHeight={24} />
				<SkeletonLine minWidth={30} maxWidth={45} blockHeight={32} />
				<SkeletonLine minWidth={45} maxWidth={65} blockHeight={24} />
			</div>

			<div className="grid gap-5">
				<LayerCard className="grid gap-5 p-5">
					<div className="flex flex-col gap-2">
						<SkeletonLine minWidth={20} maxWidth={35} blockHeight={28} />
						<SkeletonLine minWidth={45} maxWidth={65} blockHeight={22} />
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
						<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
					</div>
					<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
					<SkeletonLine minWidth={70} maxWidth={90} blockHeight={120} />
				</LayerCard>

				<LayerCard className="grid gap-5 p-5">
					<div className="flex flex-col gap-2">
						<SkeletonLine minWidth={20} maxWidth={35} blockHeight={28} />
						<SkeletonLine minWidth={45} maxWidth={65} blockHeight={22} />
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
						<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
					</div>
				</LayerCard>
			</div>
		</section>
	);
}

export function ScopeSettingsSkeleton() {
	return (
		<section
			aria-busy="true"
			aria-label="設定を読み込み中"
			className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10"
			role="status"
		>
			<div className="grid gap-5">
				<LayerCard className="grid gap-4 p-5">
					<div className="grid gap-1">
						<SkeletonLine minWidth={25} maxWidth={40} blockHeight={28} />
						<SkeletonLine minWidth={45} maxWidth={65} blockHeight={24} />
					</div>
					<div className="grid justify-items-start gap-1.5">
						<SkeletonLine minWidth={35} maxWidth={55} blockHeight={40} />
						<SkeletonLine minWidth={30} maxWidth={42} blockHeight={24} />
					</div>
				</LayerCard>

				<LayerCard className="grid gap-4 p-5">
					<div className="grid gap-1">
						<SkeletonLine minWidth={25} maxWidth={40} blockHeight={28} />
						<SkeletonLine minWidth={45} maxWidth={65} blockHeight={24} />
						<SkeletonLine minWidth={35} maxWidth={55} blockHeight={24} />
					</div>
					<SkeletonLine minWidth={70} maxWidth={90} blockHeight={56} />
				</LayerCard>
			</div>
		</section>
	);
}
