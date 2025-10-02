<script lang="ts">
	import { useAriaButton } from '$lib/accessibility/aria-button';

	export let image: string;
	export let title: string;
	export let date: string;
	export let lat: number;
	export let lng: number;
	export let onMouseEnter: ((data: { lat: number; lng: number }) => void) | undefined = undefined;
	export let onMouseLeave: (() => void) | undefined = undefined;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="group relative overflow-hidden rounded-xl border border-gray-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-[#23232a] dark:bg-[#23232a]"
	on:mouseenter={() => {
		if (onMouseEnter) {
			onMouseEnter({ lat, lng });
		}
	}}
	on:mouseleave={() => {
		if (onMouseLeave) {
			onMouseLeave();
		}
	}}
	use:useAriaButton={{ label: title }}
>
	<div class="aspect-[4/3] overflow-hidden">
		<img
			src={image}
			alt={title}
			class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
		/>
	</div>
	<div class="p-4">
		<h3 class="font-medium text-gray-900 dark:text-gray-100">{title}</h3>
		<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{date}</p>
	</div>
</div>
