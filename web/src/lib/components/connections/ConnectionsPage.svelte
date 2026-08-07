<!-- 🖥️ CLIENT-SIDE COMPONENT: Connections Page -->
<!-- This component demonstrates proper client-side architecture -->
<!-- NOTE: This component is deprecated. Use the route at /dashboard/connections instead -->

<script lang="ts">
	import {
		Link,
		Database,
		RefreshCw,
		Copy,
		Check,
		AlertTriangle,
		X,
		Smartphone,
		ExternalLink
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { translate } from '$lib/i18n';
	import { config } from '$lib/config';

	import { fluxbase } from '$lib/fluxbase';

	// Simple client logger
	function logClient(message: string, level: 'info' | 'error') {
		if (level === 'error') {
			console.error(`[Connections] ${message}`);
		} else {
			console.log(`[Connections] ${message}`);
		}
	}

	// Use the reactive translation function
	let t = $derived($translate);

	let copiedField = $state('');

	// OwnTracks API key state
	let owntracksApiKeyConfigured = $state(false);
	let userId = $state<string | null>(null);

	// Modal state for showing newly generated key
	let showApiKeyModal = $state(false);
	let newlyGeneratedApiKey = $state<string | null>(null);
	let newlyGeneratedEndpoint = $state<string | null>(null);

	async function refreshApiKeyData() {
		const { data, error } = await fluxbase.auth.getUser();

		if (data?.user && !error) {
			const user = data.user;
			userId = user.id;

			// Check if OwnTracks API key secret is configured (batch list, no 404).
			try {
				const allSecrets = await fluxbase.settings.listSecrets();
				const owntracksMeta = (allSecrets as any[])?.find(
					(s: any) => s.key === 'owntracks_api_key'
				);
				owntracksApiKeyConfigured = !!owntracksMeta;
			} catch {
				owntracksApiKeyConfigured = false;
			}
		}
	}

	async function generateApiKey() {
		try {
			const { data } = await fluxbase.auth.getUser();
			if (!data?.user) {
				toast.error(t('connections.userNotAuthenticated'));
				return;
			}

			// Generate a secure random API key (16 bytes = 32 hex characters)
			const array = new Uint8Array(16);
			crypto.getRandomValues(array);
			const newApiKey = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');

			logClient(`Generating new API key for user: ${data.user.id}`, 'info');

			// Store the API key as an encrypted user secret
			await fluxbase.settings.setSecret('owntracks_api_key', newApiKey, {
				description: 'OwnTracks integration API key'
			});

			logClient('API key stored successfully as encrypted secret', 'info');

			// Construct the endpoint URL with the new API key
			const baseUrl = config.fluxbaseUrl;
			const url = new URL(`${baseUrl}/api/v1/functions/owntracks-points/invoke`);
			url.searchParams.append('namespace', 'wayli');
			url.searchParams.append('api_key', newApiKey);
			url.searchParams.append('user_id', data.user.id);

			// Store for modal display
			newlyGeneratedApiKey = newApiKey;
			newlyGeneratedEndpoint = url.toString();
			owntracksApiKeyConfigured = true;

			// Show the modal with the new key
			showApiKeyModal = true;
		} catch (error) {
			logClient('Error generating API key', 'error');
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

	function closeApiKeyModal() {
		showApiKeyModal = false;
		// Clear the newly generated key from memory for security
		newlyGeneratedApiKey = null;
		newlyGeneratedEndpoint = null;
		toast.success(t('connections.apiKeyGeneratedSuccess'));
	}

	onMount(async () => {
		logClient('Connections page mounted', 'info');
		await refreshApiKeyData();
	});
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<Link class="text-primary dark:text-muted-foreground h-8 w-8" />
			<h1 class="text-foreground text-3xl font-bold tracking-tight">
				{t('connections.title')}
			</h1>
		</div>
	</div>

	<!-- Connections -->
	<div class="space-y-6">
		<!-- OwnTracks Integration -->
		<div class="border-border dark:border-border dark:bg-card rounded-xl border bg-white p-6">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Database class="text-muted-foreground h-5 w-5" />
					<h2 class="text-foreground text-xl font-semibold">
						{t('connections.owntracksIntegration')}
					</h2>
				</div>
				<p class="text-muted-foreground mt-1 text-sm">
					{t('connections.owntracksDescription')}
				</p>
				<!-- App Download Links -->
				<div class="mt-3 flex flex-wrap gap-2">
					<a
						href="https://play.google.com/store/apps/details?id=org.owntracks.android"
						target="_blank"
						rel="noopener noreferrer"
						class="dark:border-border dark:text-muted-foreground bg-card hover:bg-muted inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors"
					>
						<Smartphone class="h-4 w-4" />
						{t('connections.downloadAndroid')}
						<ExternalLink class="h-3 w-3 opacity-50" />
					</a>
					<a
						href="https://apps.apple.com/app/owntracks/id692424691"
						target="_blank"
						rel="noopener noreferrer"
						class="dark:border-border dark:text-muted-foreground bg-card hover:bg-muted inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors"
					>
						<Smartphone class="h-4 w-4" />
						{t('connections.downloadIOS')}
						<ExternalLink class="h-3 w-3 opacity-50" />
					</a>
				</div>
			</div>

			<div class="space-y-4">
				<!-- API Key Status -->
				<div>
					<label class="text-foreground mb-1.5 block text-sm font-medium" for="owntracksApiKey"
						>{t('connections.apiKey')}</label
					>
					{#if owntracksApiKeyConfigured}
						<div
							class="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-900/20"
						>
							<Check class="h-4 w-4 text-green-600 dark:text-green-400" />
							<span class="text-sm font-medium text-green-700 dark:text-green-300">
								{t('connections.apiKeyConfigured')}
							</span>
						</div>
						<p class="text-muted-foreground mt-1.5 text-xs">
							{t('connections.apiKeyConfiguredDescription')}
						</p>
					{:else}
						<div
							class="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20"
						>
							<AlertTriangle class="h-4 w-4 text-amber-600 dark:text-amber-400" />
							<span class="text-sm font-medium text-amber-700 dark:text-amber-300">
								{t('connections.noApiKeyGenerated')}
							</span>
						</div>
					{/if}
				</div>

				<!-- Generate API Key Button -->
				<button
					type="button"
					onclick={generateApiKey}
					class="bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
				>
					<RefreshCw class="h-4 w-4" />
					{owntracksApiKeyConfigured
						? t('connections.regenerateApiKey')
						: t('connections.generateApiKey')}
				</button>

				{#if owntracksApiKeyConfigured}
					<p class="text-muted-foreground text-xs">
						{t('connections.regenerateWarning')}
					</p>
				{/if}

				<!-- Instructions -->
				<div
					class="border-primary/30 bg-primary/5 dark:border-primary/30 dark:bg-primary/20 mt-4 rounded-lg border p-4"
				>
					<h3 class="text-primary dark:text-primary mb-2 text-sm font-medium">
						{t('connections.setupInstructions')}
					</h3>
					<ol class="text-primary dark:text-primary/80 list-inside list-decimal space-y-1 text-sm">
						<li>{t('connections.instruction1')}</li>
						<li>{t('connections.instruction2')}</li>
						<li>{t('connections.instruction3')}</li>
					</ol>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- API Key Modal - Show once when generated -->
{#if showApiKeyModal && newlyGeneratedApiKey && newlyGeneratedEndpoint}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		onclick={(e) => e.target === e.currentTarget && closeApiKeyModal()}
		onkeydown={(e) => e.key === 'Escape' && closeApiKeyModal()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="dark:bg-card w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
			<div class="mb-4 flex items-start justify-between">
				<div class="flex items-center gap-2">
					<AlertTriangle class="h-5 w-5 text-amber-500" />
					<h2 class="text-foreground text-lg font-semibold">
						{t('connections.saveYourApiKey')}
					</h2>
				</div>
				<button
					type="button"
					onclick={closeApiKeyModal}
					class="text-muted-foreground hover:bg-muted hover:text-muted-foreground rounded-md p-1"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<div
				class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
			>
				<p class="text-sm text-amber-800 dark:text-amber-200">
					{t('connections.apiKeyWarning')}
				</p>
			</div>

			<div class="space-y-4">
				<!-- API Endpoint -->
				<div>
					<label for="apiEndpoint" class="text-foreground mb-1.5 block text-sm font-medium">
						{t('connections.apiEndpoint')}
					</label>
					<div class="flex gap-2">
						<input
							id="apiEndpoint"
							type="text"
							value={newlyGeneratedEndpoint}
							readonly
							class="border-border dark:border-border dark:bg-card dark:text-foreground flex-1 rounded-md border bg-gray-50 px-3 py-2 text-xs text-gray-900"
						/>
						<button
							type="button"
							onclick={() =>
								newlyGeneratedEndpoint &&
								copyToClipboard(newlyGeneratedEndpoint, t('connections.apiEndpoint'))}
							class="border-border hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-card flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-700 transition-colors"
						>
							{#if copiedField === t('connections.apiEndpoint')}
								<Check class="h-4 w-4" />
							{:else}
								<Copy class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<!-- API Key -->
				<div>
					<label for="apiKey" class="text-foreground mb-1.5 block text-sm font-medium">
						{t('connections.apiKey')}
					</label>
					<div class="flex gap-2">
						<input
							id="apiKey"
							type="text"
							value={newlyGeneratedApiKey}
							readonly
							class="border-border dark:border-border dark:bg-card dark:text-foreground flex-1 rounded-md border bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900"
						/>
						<button
							type="button"
							onclick={() =>
								newlyGeneratedApiKey &&
								copyToClipboard(newlyGeneratedApiKey, t('connections.apiKey'))}
							class="border-border hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-card flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-700 transition-colors"
						>
							{#if copiedField === t('connections.apiKey')}
								<Check class="h-4 w-4" />
							{:else}
								<Copy class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>
			</div>

			<div class="mt-6 flex justify-end">
				<button
					type="button"
					onclick={closeApiKeyModal}
					class="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
				>
					{t('connections.iHaveSavedMyKey')}
				</button>
			</div>
		</div>
	</div>
{/if}
