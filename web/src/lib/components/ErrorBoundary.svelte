<script lang="ts">
	import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		children: Snippet;
		showDetails?: boolean;
		errorMessage?: string;
	};

	let { children, showDetails = false, errorMessage = 'Something went wrong' }: Props = $props();

	let error = $state<Error | null>(null);

	function retry() {
		error = null;
	}

	function reset() {
		error = null;
	}
</script>

<svelte:boundary
	onerror={(e) => {
		error = e as Error;
	}}
>
	{#if error}
		<div class="w-full p-4" role="alert" aria-live="polite">
			<div
				class="border-destructive/30 bg-destructive/10 flex items-start gap-4 rounded-lg border p-4"
			>
				<AlertCircle class="text-destructive mt-0.5 h-6 w-6 flex-shrink-0" aria-hidden="true" />

				<div class="flex-1">
					<h3 class="text-foreground mb-2 text-base font-semibold">{errorMessage}</h3>
					<p class="text-muted-foreground mb-4 text-sm leading-relaxed">
						We're sorry, but something went wrong. Please try again or contact support if the
						problem persists.
					</p>

					{#if showDetails && error}
						<details class="mb-4">
							<summary
								class="text-foreground mb-2 cursor-pointer font-semibold marker:text-muted-foreground"
							>
								Error Details
							</summary>
							<div
								class="bg-muted border-border overflow-x-auto rounded-md border p-3 font-mono text-xs"
							>
								<strong>Error:</strong>
								{error.message}
								{#if error.stack}
									<pre class="mt-2 break-words whitespace-pre-wrap">{error.stack}</pre>
								{/if}
							</div>
						</details>
					{/if}

					<div class="mt-4 flex gap-3">
						<button
							type="button"
							onclick={retry}
							aria-label="Retry loading"
							class="bg-destructive hover:bg-destructive/90 inline-flex items-center gap-2 rounded-md border border-transparent px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors"
						>
							<RefreshCw class="h-4 w-4" />
							Try Again
						</button>

						<button
							type="button"
							onclick={reset}
							aria-label="Reset error state"
							class="text-destructive hover:bg-destructive/10 border-destructive/40 inline-flex items-center gap-2 rounded-md border bg-transparent px-4 py-2 text-sm font-medium transition-colors"
						>
							<RotateCcw class="h-4 w-4" />
							Reset
						</button>
					</div>
				</div>
			</div>
		</div>
	{:else}
		{@render children?.()}
	{/if}
</svelte:boundary>
