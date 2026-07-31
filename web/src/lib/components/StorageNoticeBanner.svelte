<script lang="ts">
	import { X, Info } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { translate } from '$lib/i18n';
	import { state as appState } from '$lib/stores/app-state.svelte';

	const STORAGE_KEY = 'wayli-storage-notice-dismissed';

	let t = $derived($translate);

	let isDismissed = $state(false);
	let isLoading = $state(true);

	let shouldShow = $derived(!isLoading && !isDismissed);

	// Sync banner visibility with global state for layout adjustments
	$effect(() => {
		appState.storageBannerVisible = shouldShow;
	});

	$effect(() => {
		if (browser) {
			const dismissed = localStorage.getItem(STORAGE_KEY);
			isDismissed = dismissed === 'true';
			isLoading = false;
		}
	});

	function handleDismiss() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, 'true');
		}
		isDismissed = true;
	}
</script>

{#if shouldShow}
	<!-- Spacer to prevent content from being hidden behind fixed banner -->
	<div class="bg-muted h-12"></div>
	<div
		class="bg-muted border-border fixed top-0 right-0 left-0 z-50 border-b"
		transition:slide={{ duration: 300 }}
		role="alert"
		aria-live="polite"
	>
		<div class="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between gap-4">
				<div class="flex items-center gap-3">
					<Info class="text-muted-foreground h-5 w-5 shrink-0" />
					<p class="text-muted-foreground text-sm">
						{t('storageNotice.message')}
					</p>
				</div>
				<button
					onclick={handleDismiss}
					class="text-muted-foreground hover:text-muted-foreground shrink-0"
					aria-label={t('common.actions.close')}
				>
					<X class="h-5 w-5" />
				</button>
			</div>
		</div>
	</div>
{/if}
