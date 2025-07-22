<script lang="ts">
	import { Link, Database, RefreshCw, Copy, Check } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	export let data;

	let copiedField = '';

	function copyToClipboard(text: string, fieldName: string) {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				copiedField = fieldName;
				toast.success(`${fieldName} copied to clipboard`);
				setTimeout(() => {
					copiedField = '';
				}, 2000);
			})
			.catch(() => {
				toast.error('Failed to copy to clipboard');
			});
	}

	onMount(() => {
		// Show success message if API key was generated
		if ($page.form?.success) {
			toast.success('API key generated successfully!');
		}
	});

	// Watch for form results
	$: if ($page.form?.success) {
		toast.success('API key generated successfully!');
	} else if ($page.form?.error) {
		toast.error($page.form.error);
	}

	// Enhanced form submission that refreshes data after success
	function handleGenerateApiKey() {
		return async ({ result, update }: { result: any; update: any }) => {
			console.log('Form submission result:', result);
			if (result.type === 'success') {
				console.log('API key generated successfully, refreshing data...');
				// Refresh the page data to show the new API key
				await invalidateAll();
				toast.success('API key generated successfully');
			} else if (result.type === 'failure') {
				console.log('API key generation failed:', result.data);
				toast.error(result.data?.error || 'Failed to generate API key');
			}
			await update();
		};
	}
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<Link class="h-8 w-8 text-blue-600 dark:text-gray-400" />
					<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
			Connections
		</h1>
		</div>
	</div>

	<!-- Connections -->
	<div class="space-y-6">
		<!-- OwnTracks Integration -->
		<div
			class="rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
		>
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Database class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						OwnTracks Integration
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
					Set up Wayli with OwnTracks by using the following API endpoint and key in your OwnTracks
					app.
				</p>
			</div>

			<div class="space-y-4">
				<!-- API Endpoint -->
				<div>
					<label
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
						for="owntracksEndpoint">API Endpoint</label
					>
					<div class="flex gap-2">
						<input
							type="text"
							value={data.owntracksEndpoint || 'Generate an API key first'}
							readonly
							id="owntracksEndpoint"
							class="flex-1 rounded-md border border-[rgb(218,218,221)] bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-[#3f3f46] dark:bg-[#1a1a1a] dark:text-gray-100"
						/>
						{#if data.owntracksEndpoint}
							<button
								type="button"
								on:click={() =>
									data.owntracksEndpoint && copyToClipboard(data.owntracksEndpoint, 'API Endpoint')}
								class="flex items-center gap-2 rounded-md border border-[rgb(218,218,221)] px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#3f3f46] dark:text-gray-300 dark:hover:bg-[#1a1a1a]"
							>
								{#if copiedField === 'API Endpoint'}
									<Check class="h-4 w-4" />
								{:else}
									<Copy class="h-4 w-4" />
								{/if}
							</button>
						{/if}
					</div>
				</div>

				<!-- API Key -->
				<div>
					<label
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
						for="owntracksApiKey">API Key</label
					>
					<div class="flex gap-2">
						<input
							type="text"
							value={data.owntracksApiKey || 'No API key generated'}
							readonly
							id="owntracksApiKey"
							class="flex-1 rounded-md border border-[rgb(218,218,221)] bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-[#3f3f46] dark:bg-[#1a1a1a] dark:text-gray-100"
						/>
						{#if data.owntracksApiKey}
							<button
								type="button"
								on:click={() =>
									data.owntracksApiKey && copyToClipboard(data.owntracksApiKey, 'API Key')}
								class="flex items-center gap-2 rounded-md border border-[rgb(218,218,221)] px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#3f3f46] dark:text-gray-300 dark:hover:bg-[#1a1a1a]"
							>
								{#if copiedField === 'API Key'}
									<Check class="h-4 w-4" />
								{:else}
									<Copy class="h-4 w-4" />
								{/if}
							</button>
						{/if}
					</div>
				</div>

				<!-- Generate API Key Button -->
				<form method="POST" action="?/generateApiKey" use:enhance>
					<button
						type="submit"
						on:click={() => console.log('Generate API Key button clicked')}
						class="flex cursor-pointer items-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgb(37,140,244)]/90"
					>
						<RefreshCw class="h-4 w-4" />
						{data.owntracksApiKey ? 'Generate New API Key' : 'Generate API Key'}
					</button>
				</form>

				<!-- Instructions -->
				<div
					class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
				>
					<h3 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200">
						Setup Instructions:
					</h3>
					<ol class="list-inside list-decimal space-y-1 text-sm text-blue-700 dark:text-blue-300">
						<li>Generate an API key using the button above</li>
						<li>Copy the API endpoint and key</li>
						<li>In your OwnTracks app, set the endpoint to the copied URL</li>
					</ol>
				</div>
			</div>
		</div>
	</div>
</div>
