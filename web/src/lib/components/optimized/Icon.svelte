<script lang="ts">
	import { onMount } from 'svelte';

	import { bundleMonitor } from '$lib/utils/bundle-optimizer';

	export let name: string;
	export let size = 24;
	export let className = '';
	export let color = 'currentColor';
	export let strokeWidth = 2;

	let iconComponent: any = null;
	let loading = false;
	let error = false;

	async function loadIcon(iconName: string) {
		// Check if already loaded
		if (iconComponent) return iconComponent;

		// Start performance monitoring
		bundleMonitor.startTimer();

		loading = true;
		error = false;

		try {
			// Dynamic import of specific icon
			const module = await import(`lucide-svelte/dist/esm/icons/${iconName}.js`);
			iconComponent = module.default;

			// End performance monitoring
			bundleMonitor.endTimer();

			return iconComponent;
		} catch {
			console.warn(`Icon ${iconName} not found in lucide-svelte`);
			error = true;
			return null;
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		if (!name) return;
		await loadIcon(name);
	});

	// No reactive statement needed - icon names are static in this codebase
</script>

{#if loading}
	<div
		class="icon animate-pulse rounded bg-gray-200 dark:bg-gray-700 {className}"
		style="width: {size}px; height: {size}px;"
	></div>
{:else if error}
	<div
		class="icon flex items-center justify-center text-gray-400 dark:text-gray-600 {className}"
		style="width: {size}px; height: {size}px;"
	>
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width={strokeWidth}
		>
			<circle cx="12" cy="12" r="10" />
			<line x1="15" y1="9" x2="9" y2="15" />
			<line x1="9" y1="9" x2="15" y2="15" />
		</svg>
	</div>
{:else if iconComponent}
	<svelte:component this={iconComponent} {size} {color} {strokeWidth} class="icon {className}" />
{/if}

<style>
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
