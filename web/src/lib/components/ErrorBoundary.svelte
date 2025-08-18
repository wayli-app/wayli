<!-- src/lib/components/ErrorBoundary.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';

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
	<div class="error-boundary" role="alert" aria-live="polite">
		<div class="error-container">
			<div class="error-icon">
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
			</div>

			<div class="error-content">
				<h3 class="error-title">{errorMessage}</h3>
				<p class="error-description">
					We're sorry, but something went wrong. Please try again or contact support if the problem
					persists.
				</p>

				{#if showDetails && error}
					<details class="error-details">
						<summary>Error Details</summary>
						<div class="error-stack">
							<strong>Error:</strong>
							{error.message}
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
					<button type="button" class="retry-button" onclick={retry} aria-label="Retry loading">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
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
						onclick={reset}
						aria-label="Reset error state"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
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

<style>
	.error-boundary {
		width: 100%;
		padding: 1rem;
	}

	.error-container {
		background-color: rgb(254 242 242);
		border: 1px solid rgb(254 202 202);
		border-radius: 0.5rem;
		padding: 1rem;
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.error-icon {
		flex-shrink: 0;
		color: rgb(239 68 68);
		margin-top: 0.125rem;
	}

	.error-content {
		flex: 1;
	}

	.error-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: rgb(127 29 29);
		margin: 0 0 0.5rem 0;
	}

	.error-description {
		color: rgb(127 29 29);
		margin: 0 0 1rem 0;
		line-height: 1.5;
	}

	.error-details {
		margin: 1rem 0;
	}

	.error-details summary {
		cursor: pointer;
		font-weight: 600;
		color: rgb(127 29 29);
		margin-bottom: 0.5rem;
	}

	.error-stack {
		background-color: rgb(255 255 255);
		border: 1px solid rgb(254 202 202);
		border-radius: 0.375rem;
		padding: 0.75rem;
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 0.875rem;
		line-height: 1.5;
		overflow-x: auto;
	}

	.error-stack-trace {
		margin: 0.5rem 0 0 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.error-info {
		margin: 0.5rem 0 0 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.error-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.retry-button,
	.reset-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid rgb(239 68 68);
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.retry-button {
		background-color: rgb(239 68 68);
		color: white;
	}

	.retry-button:hover {
		background-color: rgb(220 38 38);
		border-color: rgb(220 38 38);
	}

	.reset-button {
		background-color: transparent;
		color: rgb(239 68 68);
	}

	.reset-button:hover {
		background-color: rgb(239 68 68);
		color: white;
	}

	.retry-info {
		margin-top: 1rem;
		padding: 0.75rem;
		background-color: rgb(254 243 199);
		border: 1px solid rgb(253 230 138);
		border-radius: 0.375rem;
	}

	.retry-info p {
		margin: 0;
		color: rgb(120 53 15);
		font-size: 0.875rem;
		text-align: center;
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.error-container {
			background-color: rgb(30 41 59);
			border-color: rgb(71 85 105);
		}

		.error-title,
		.error-description {
			color: rgb(248 113 113);
		}

		.error-stack {
			background-color: rgb(15 23 42);
			border-color: rgb(71 85 105);
		}

		.retry-button:hover {
			background-color: rgb(185 28 28);
			border-color: rgb(185 28 28);
		}

		.reset-button {
			color: rgb(248 113 113);
		}

		.reset-button:hover {
			background-color: rgb(248 113 113);
			color: rgb(15 23 42);
		}

		.retry-info {
			background-color: rgb(45 25 0);
			border-color: rgb(120 53 15);
		}

		.retry-info p {
			color: rgb(251 191 36);
		}
	}
</style>
