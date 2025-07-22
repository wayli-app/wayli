<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	import { X } from 'lucide-svelte';

	export let open = false;
	export let title = '';
	export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
	export let showCloseButton = true;
	export let closeOnBackdropClick = true;
	export let closeOnEscape = true;

	const dispatch = createEventDispatcher();

	const sizeClasses = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-4xl'
	};

	function handleBackdropClick() {
		if (closeOnBackdropClick) {
			closeModal();
		}
	}

	function handleEscapeKey(event: KeyboardEvent) {
		if (closeOnEscape && event.key === 'Escape') {
			closeModal();
		}
	}

	function closeModal() {
		dispatch('close');
	}
</script>

<svelte:window on:keydown={handleEscapeKey} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex cursor-pointer items-start justify-center bg-black/40 backdrop-blur-sm transition-all p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="0"
		on:click={handleBackdropClick}
		on:keydown={(e) => {
			if (e.key === 'Escape') handleBackdropClick();
			if (e.key === 'Enter' || e.key === ' ') handleBackdropClick();
		}}
		transition:fade={{ duration: 200 }}
	>
		<div
			class="relative w-full cursor-default rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-900 {sizeClasses[size]} max-h-[calc(100vh-2rem)] overflow-y-auto my-4"
			role="document"
			transition:fade={{ duration: 200, delay: 100 }}
		>
			<!-- Header -->
			{#if title || showCloseButton}
				<div class="mb-6 flex items-start justify-between">
					{#if title}
						<h2 id="modal-title" class="text-2xl font-bold text-gray-900 dark:text-gray-100">
							{title}
						</h2>
					{/if}
					{#if showCloseButton}
						<button
							type="button"
							class="absolute top-4 right-4 cursor-pointer p-1 text-gray-400 transition-colors hover:text-red-500"
							on:click={closeModal}
							on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeModal(); }}
							aria-label="Close modal"
						>
							<X class="h-5 w-5" />
						</button>
					{/if}
				</div>
			{/if}

			<!-- Content -->
			<div class="space-y-6">
				<slot />
			</div>
		</div>
	</div>
{/if}
