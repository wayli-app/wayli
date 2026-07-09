<script lang="ts">
	import { onMount } from 'svelte';
	import { userStore } from '$lib/stores/auth';
	import { getEntryLikeInfo, toggleEntryLike } from '$lib/services/social.service';
	import { Heart, Loader2 } from 'lucide-svelte';

	type Props = {
		tripId: string;
		entryId: string;
	};

	let { tripId, entryId }: Props = $props();

	let count = $state(0);
	let liked = $state(false);
	let isLoading = $state(true);
	let isToggling = $state(false);

	onMount(async () => {
		try {
			const info = await getEntryLikeInfo(entryId, $userStore?.id);
			count = info.count;
			liked = info.liked;
		} catch {
			// Non-public entries return empty — fine
		} finally {
			isLoading = false;
		}
	});

	async function handleToggle() {
		if (!$userStore?.id || isToggling) return;
		isToggling = true;
		try {
			const result = await toggleEntryLike($userStore.id, tripId, entryId);
			liked = result.liked;
			count += result.liked ? 1 : -1;
		} catch (err) {
			console.error('Failed to toggle like:', err);
		} finally {
			isToggling = false;
		}
	}
</script>

{#if !isLoading}
	<button
		type="button"
		onclick={handleToggle}
		disabled={!$userStore?.id || isToggling}
		class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors {liked
			? 'text-red-500'
			: 'text-muted-foreground hover:text-red-500'} disabled:cursor-not-allowed disabled:opacity-50"
	>
		{#if isToggling}
			<Loader2 class="h-3.5 w-3.5 animate-spin" />
		{:else}
			<Heart class="h-3.5 w-3.5" fill={liked ? 'currentColor' : 'none'} />
		{/if}
		{count > 0 ? count : ''}
	</button>
{/if}
