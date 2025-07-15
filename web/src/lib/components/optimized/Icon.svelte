<script lang="ts">
	import { onMount } from 'svelte';
	import { bundleMonitor } from '$lib/utils/bundle-optimizer';

	export let name: string;
	export let size = 24;
	export let className = '';
	export let color = 'currentColor';
	export let strokeWidth = 2;

	let iconComponent: unknown = null;
	let loading = false;
	let error = false;

	async function loadIcon(iconName: string) {
		const cacheKey = `icon-${iconName}`;

		// Check if already loaded
		if (iconComponent) return iconComponent;

		// Start performance monitoring
		bundleMonitor.startTimer(`icon-${iconName}`);

		loading = true;
		error = false;

		try {
			// Dynamic import of specific icon
			const module = await import(`lucide-svelte/dist/esm/icons/${iconName}.js`);
			iconComponent = module.default;

			// End performance monitoring
			bundleMonitor.endTimer(`icon-${iconName}`);

			return iconComponent;
		} catch (err) {
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

	// Reload icon when name changes
	$: if (name && iconComponent !== name) {
		(async () => {
			iconComponent = null;
			await loadIcon(name);
		})();
	}
</script>

{#if loading}
	<div
		class="animate-pulse bg-gray-200 dark:bg-gray-700 rounded icon {className}"
		style="width: {size}px; height: {size}px;"
		{color}
		{strokeWidth}
	/>
{:else if error}
	<div
		class="flex items-center justify-center text-gray-400 dark:text-gray-600 icon {className}"
		style="width: {size}px; height: {size}px;"
		{color}
		{strokeWidth}
	>
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth}>
			<circle cx="12" cy="12" r="10"/>
			<line x1="15" y1="9" x2="9" y2="15"/>
			<line x1="9" y1="9" x2="15" y2="15"/>
		</svg>
	</div>
{:else if iconComponent}
	<svelte:component
		this={iconComponent}
		{size}
		{color}
		{strokeWidth}
		class="icon {className}"
	/>
{/if}

<style>
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>