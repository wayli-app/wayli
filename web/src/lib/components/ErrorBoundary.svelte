<!-- src/lib/components/ErrorBoundary.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { errorHandler, ErrorCode } from '$lib/services/error-handler.service';
	import { loggingService } from '$lib/services/logging.service';
	import { createEventDispatcher } from 'svelte';

	export const fallback = undefined;
	export let showDetails = false;
	export let errorMessage = 'Something went wrong';
	export let autoRetry = false;
	export let maxRetries = 3;
	export let retryDelay = 1000;

	const dispatch = createEventDispatcher<{
		error: { error: Error; errorInfo?: unknown };
		retry: void;
		reset: void;
	}>();

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

		// Dispatch error event
		dispatch('error', { error: err, errorInfo });

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
		dispatch('reset', undefined);
	}

	// Manual retry
	function retry() {
		error = null;
		errorInfo = null;
		dispatch('retry', undefined);
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
	<div class="error-boundary" role="alert" aria-live="polite">
		<div class="error-container">
			<div class="error-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
			</div>

			<div class="error-content">
				<h3 class="error-title">{errorMessage}</h3>
				<p class="error-description">
					We're sorry, but something went wrong. Please try again or contact support if the problem persists.
				</p>

				{#if showDetails && error}
					<details class="error-details">
						<summary>Error Details</summary>
						<div class="error-stack">
							<strong>Error:</strong> {error.message}
							{#if error.stack}
								<pre class="error-stack-trace">{error.stack}</pre>
							{/if}
							{#if errorInfo}
								<strong>Error Info:</strong>
								<pre class="error-info">{JSON.stringify(errorInfo, null, 2)}</pre>
							{/if}
						</div>
					</details>
				{/if}

				<div class="error-actions">
					<button
						type="button"
						class="retry-button"
						on:click={retry}
						aria-label="Retry loading"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
							<path d="M21 3v5h-5" />
							<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
							<path d="M3 21v-5h5" />
						</svg>
						Try Again
					</button>

					<button
						type="button"
						class="reset-button"
						on:click={reset}
						aria-label="Reset error state"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
							<path d="M21 3v5h-5" />
							<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
							<path d="M3 21v-5h5" />
						</svg>
						Reset
					</button>
				</div>

				{#if autoRetry && retryCount < maxRetries}
					<div class="retry-info">
						<p>Retrying automatically in {Math.ceil(retryDelay / 1000)} seconds... (Attempt {retryCount} of {maxRetries})</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<slot />
{/if}

<style>
	.error-boundary {
		width: 100%;
		padding: 1rem;
	}

	.error-container {
		background-color: rgb(254 242 242);
		border: 1px solid rgb(254 202 202);
		border-radius: 0.5rem;
		padding: 1.5rem;
		max-width: 42rem;
		margin: 0 auto;
	}

	.error-icon {
		display: flex;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.error-icon svg {
		color: rgb(239 68 68);
	}

	.error-content {
		text-align: center;
	}

	.error-title {
		font-size: 1.125rem;
		line-height: 1.75rem;
		font-weight: 600;
		color: rgb(153 27 27);
		margin-bottom: 0.5rem;
	}

	.error-description {
		color: rgb(185 28 28);
		margin-bottom: 1rem;
	}

	.error-details {
		text-align: left;
		background-color: rgb(254 226 226);
		border: 1px solid rgb(254 202 202);
		border-radius: 0.25rem;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.error-details summary {
		cursor: pointer;
		font-weight: 500;
		color: rgb(153 27 27);
		margin-bottom: 0.5rem;
	}

	.error-stack {
		font-size: 0.875rem;
		line-height: 1.25rem;
		color: rgb(185 28 28);
	}

	.error-stack-trace,
	.error-info {
		background-color: rgb(254 242 242);
		border: 1px solid rgb(254 202 202);
		border-radius: 0.25rem;
		padding: 0.5rem;
		margin-top: 0.5rem;
		font-size: 0.75rem;
		line-height: 1rem;
		font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
		overflow-x: auto;
	}

	.error-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.retry-button,
	.reset-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-weight: 500;
		transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 150ms;
	}

	.retry-button {
		background-color: rgb(220 38 38);
		color: white;
	}

	.retry-button:hover {
		background-color: rgb(185 28 28);
	}

	.retry-button:focus {
		outline: 2px solid transparent;
		outline-offset: 2px;
		box-shadow: 0 0 0 2px rgb(239 68 68);
	}

	.reset-button {
		background-color: rgb(75 85 99);
		color: white;
	}

	.reset-button:hover {
		background-color: rgb(55 65 81);
	}

	.reset-button:focus {
		outline: 2px solid transparent;
		outline-offset: 2px;
		box-shadow: 0 0 0 2px rgb(107 114 128);
	}

	.retry-info {
		font-size: 0.875rem;
		line-height: 1.25rem;
		color: rgb(185 28 28);
		background-color: rgb(254 226 226);
		border: 1px solid rgb(254 202 202);
		border-radius: 0.25rem;
		padding: 0.5rem;
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.error-container {
			background-color: rgb(127 29 29 / 0.2);
			border-color: rgb(185 28 28);
		}

		.error-title {
			color: rgb(254 202 202);
		}

		.error-description {
			color: rgb(252 165 165);
		}

		.error-details {
			background-color: rgb(127 29 29 / 0.3);
			border-color: rgb(185 28 28);
		}

		.error-details summary {
			color: rgb(254 202 202);
		}

		.error-stack {
			color: rgb(252 165 165);
		}

		.error-stack-trace,
		.error-info {
			background-color: rgb(127 29 29 / 0.2);
			border-color: rgb(185 28 28);
		}

		.retry-info {
			color: rgb(252 165 165);
			background-color: rgb(127 29 29 / 0.3);
			border-color: rgb(185 28 28);
		}
	}
</style>
