<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';

	export let open = false;

	const dispatch = createEventDispatcher();
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center" transition:fade>
		<div class="fixed inset-0 bg-black/50" on:click={() => dispatch('close')} />
		<div
			class="relative z-50 w-full max-w-lg rounded-lg bg-white p-6 shadow-lg"
			transition:fade={{ duration: 200 }}
		>
			<slot />
		</div>
	</div>
{/if}

<script context="module">
	export { default as Content } from './Content.svelte';
	export { default as Header } from './Header.svelte';
	export { default as Footer } from './Footer.svelte';
	export { default as Title } from './Title.svelte';
	export { default as Description } from './Description.svelte';
	export { default as Action } from './Action.svelte';
	export { default as Cancel } from './Cancel.svelte';
</script>