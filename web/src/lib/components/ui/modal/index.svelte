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
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all cursor-pointer"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		on:click={handleBackdropClick}
		transition:fade={{ duration: 200 }}
	>
		<div
			class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full mx-4 relative cursor-default {sizeClasses[size]} max-h-[90vh] overflow-y-auto"
			role="document"
			on:click|stopPropagation
			transition:fade={{ duration: 200, delay: 100 }}
		>
			<!-- Header -->
			{#if title || showCloseButton}
				<div class="flex items-start justify-between mb-6">
					{#if title}
						<h2 id="modal-title" class="text-2xl font-bold text-gray-900 dark:text-gray-100">
							{title}
						</h2>
					{/if}
					{#if showCloseButton}
						<button
							class="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1"
							on:click={closeModal}
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