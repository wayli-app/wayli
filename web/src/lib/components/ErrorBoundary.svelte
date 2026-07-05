<!-- src/lib/components/ErrorBoundary.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-svelte';

	import { errorHandler, ErrorCode } from '$lib/services/error-handler.service';
	import { loggingService } from '$lib/services/logging.service';

	export const fallback = undefined;
	export let showDetails = false;
	export let errorMessage = 'Something went wrong';
	export let autoRetry = false;
	export let maxRetries = 3;
	export let retryDelay = 1000;
	export let onError: ((data: { error: Error; errorInfo?: unknown }) => void) | undefined =
		undefined;
	export let onRetry: (() => void) | undefined = undefined;
	export let onReset: (() => void) | undefined = undefined;

	let error: Error | null = null;
	let errorInfo: unknown = null;
	let retryCount = 0;
	let retryTimeout: ReturnType<typeof setTimeout> | null = null;

	// Error handling function
	function handleError(err: Error, info?: unknown) {
		error = err;
		errorInfo = info;
		retryCount++;

		// Log the error
		loggingService.error('Error boundary caught error', {
			error: err.message,
			stack: err.stack,
			component: 'ErrorBoundary',
			retryCount,
			errorInfo
		});

		// Create app error and log it
		const appError = errorHandler.createError(
			ErrorCode.INTERNAL_SERVER_ERROR,
			err.message,
			500,
			err,
			{ component: 'ErrorBoundary', retryCount, errorInfo }
		);
		errorHandler.logError(appError);

		// Call error callback
		if (onError) {
			onError({ error: err, errorInfo });
		}

		// Auto-retry logic
		if (autoRetry && retryCount < maxRetries) {
			retryTimeout = setTimeout(() => {
				reset();
			}, retryDelay);
		}
	}

	// Reset error state
	function reset() {
		error = null;
		errorInfo = null;
		retryCount = 0;
		if (retryTimeout) {
			clearTimeout(retryTimeout);
			retryTimeout = null;
		}
		if (onReset) {
			onReset();
		}
	}

	// Manual retry
	function retry() {
		error = null;
		errorInfo = null;
		if (onRetry) {
			onRetry();
		}
	}

	// Cleanup on destroy
	onDestroy(() => {
		if (retryTimeout) {
			clearTimeout(retryTimeout);
		}
	});

	// Expose error handling function for parent components
	export { handleError, reset, retry };
</script>

{#if error}
	<div class="w-full p-4" role="alert" aria-live="polite">
		<div
			class="border-destructive/30 bg-destructive/10 flex items-start gap-4 rounded-lg border p-4"
		>
			<AlertCircle class="text-destructive mt-0.5 h-6 w-6 flex-shrink-0" aria-hidden="true" />

			<div class="flex-1">
				<h3 class="text-foreground mb-2 text-base font-semibold">{errorMessage}</h3>
				<p class="text-muted-foreground mb-4 text-sm leading-relaxed">
					We're sorry, but something went wrong. Please try again or contact support if the problem
					persists.
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
							{#if errorInfo}
								<strong>Error Info:</strong>
								<pre class="mt-2 break-words whitespace-pre-wrap">{JSON.stringify(
										errorInfo,
										null,
										2
									)}</pre>
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

				{#if autoRetry && retryCount < maxRetries}
					<div
						class="border-warning/30 bg-warning/10 mt-4 rounded-md border p-3 text-center text-sm text-warning"
					>
						<p>
							Retrying automatically in {Math.ceil(retryDelay / 1000)} seconds... (Attempt {retryCount}
							of {maxRetries})
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<slot />
{/if}
