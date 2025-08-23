<script lang="ts">
	import { onMount } from 'svelte';

	import { loadIcon } from '$lib/utils/bundle-optimizer';

	export let name: string;
	export let size = 24;
	export let className: string = '';
	export let color: string = 'currentColor';
	export let strokeWidth = 2;

	let iconComponent: any = null;
	let loading = false;
	let error = false;

	onMount(async () => {
		if (!name) return;

		loading = true;
		error = false;

		try {
			iconComponent = await loadIcon(name);
			if (!iconComponent) {
				error = true;
			}
		} catch (err) {
			console.error(`Failed to load icon: ${name}`, err);
			error = true;
		} finally {
			loading = false;
		}
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
