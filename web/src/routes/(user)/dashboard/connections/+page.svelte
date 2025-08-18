<script lang="ts">
	import { Link, Database, RefreshCw, Copy, Check } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { translate } from '$lib/i18n';

	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { supabase } from '$lib/core/supabase/client';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';

	// Use the reactive translation function
	let t = $derived($translate);

	let { data } = $props<{ data: any }>();

	let copiedField = $state('');

	let owntracksApiKey: string | null = null;
	let owntracksEndpoint: string | null = null;

	async function refreshApiKeyData() {
		const { data: { user }, error } = await supabase.auth.getUser();

		if (user && !error) {
			owntracksApiKey = user.user_metadata?.owntracks_api_key || null;

			// Construct the endpoint URL
			owntracksEndpoint = owntracksApiKey
				? `${PUBLIC_SUPABASE_URL}/functions/v1/owntracks-points?api_key=${owntracksApiKey}&user_id=${user.id}`
				: null;
		}
	}

	async function generateApiKey() {
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				toast.error(t('connections.userNotAuthenticated'));
				return;
			}

			const { data, error } = await supabase.functions.invoke('connections-api-key', {
				body: { action: 'generate' }
			});

			if (error) {
				console.error('❌ Error generating API key:', error);
				toast.error(t('connections.failedToGenerateApiKey'));
				return;
			}

			if (data?.success) {
				toast.success(t('connections.apiKeyGeneratedSuccess'));
				// Refresh the data to show the new API key
				await refreshApiKeyData();
			} else {
				toast.error(t('connections.failedToGenerateApiKey'));
			}
		} catch (error) {
			console.error('❌ Error generating API key:', error);
			toast.error(t('connections.failedToGenerateApiKey'));
		}
	}

	function copyToClipboard(text: string, fieldName: string) {
		navigator.clipboard
			.writeText(text)
			.then(() => {
				copiedField = fieldName;
				toast.success(t('connections.apiKeyCopied', { field: fieldName }));
				setTimeout(() => {
					copiedField = '';
				}, 2000);
			})
			.catch(() => {
				toast.error(t('connections.failedToCopy'));
			});
	}

	onMount(async () => {
		await refreshApiKeyData();

		// Show success message if API key was generated
		if ($page.form?.success) {
			toast.success(t('connections.apiKeyGeneratedSuccess'));
		}
	});

	// Watch for form results
	$effect(() => {
		if ($page.form?.success) {
			toast.success(t('connections.apiKeyGeneratedSuccess'));
		} else if ($page.form?.error) {
			toast.error($page.form.error);
		}
	});
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<Link class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
				{t('connections.title')}
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
						{t('connections.owntracksIntegration')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
					{t('connections.owntracksDescription')}
				</p>
			</div>

			<div class="space-y-4">
				<!-- API Endpoint -->
				<div>
					<label
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
						for="owntracksEndpoint">{t('connections.apiEndpoint')}</label
					>
					<div class="flex gap-2">
						<input
							type="text"
							value={owntracksEndpoint || t('connections.generateApiKeyFirst')}
							readonly
							id="owntracksEndpoint"
							class="flex-1 rounded-md border border-[rgb(218,218,221)] bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-[#3f3f46] dark:bg-[#1a1a1a] dark:text-gray-100"
						/>
						{#if owntracksEndpoint}
							<button
								type="button"
								onclick={() =>
									owntracksEndpoint &&
									copyToClipboard(owntracksEndpoint, t('connections.apiEndpoint'))}
								class="flex items-center gap-2 rounded-md border border-[rgb(218,218,221)] px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#3f3f46] dark:text-gray-300 dark:hover:bg-[#1a1a1a]"
							>
								{#if copiedField === t('connections.apiEndpoint')}
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
						for="owntracksApiKey">{t('connections.apiKey')}</label
					>
					<div class="flex gap-2">
						<input
							type="text"
							value={owntracksApiKey || t('connections.noApiKeyGenerated')}
							readonly
							id="owntracksApiKey"
							class="flex-1 rounded-md border border-[rgb(218,218,221)] bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-[#3f3f46] dark:bg-[#1a1a1a] dark:text-gray-100"
						/>
						{#if owntracksApiKey}
							<button
								type="button"
								onclick={() =>
									owntracksApiKey &&
									copyToClipboard(owntracksApiKey, t('connections.apiKey'))}
								class="flex items-center gap-2 rounded-md border border-[rgb(218,218,221)] px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#3f3f46] dark:text-gray-300 dark:hover:bg-[#1a1a1a]"
							>
								{#if copiedField === t('connections.apiKey')}
									<Check class="h-4 w-4" />
								{:else}
									<Copy class="h-4 w-4" />
								{/if}
							</button>
						{/if}
					</div>
				</div>

				<!-- Generate API Key Button -->
				<button
					type="button"
					onclick={generateApiKey}
					class="flex cursor-pointer items-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgb(37,140,244)]/90"
				>
					<RefreshCw class="h-4 w-4" />
					{owntracksApiKey
						? t('connections.generateNewApiKey')
						: t('connections.generateApiKey')}
				</button>

				<!-- Instructions -->
				<div
					class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
				>
					<h3 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200">
						{t('connections.setupInstructions')}
					</h3>
					<ol class="list-inside list-decimal space-y-1 text-sm text-blue-700 dark:text-blue-300">
						<li>{t('connections.instruction1')}</li>
						<li>{t('connections.instruction2')}</li>
						<li>{t('connections.instruction3')}</li>
					</ol>
				</div>
			</div>
		</div>
	</div>
</div>
