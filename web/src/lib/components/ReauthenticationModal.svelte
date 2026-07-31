<script lang="ts">
	import { Shield, AlertCircle, X, Lock } from 'lucide-svelte';
	import { translate } from '$lib/i18n';
	import { sessionManager, showReauthModal } from '$lib/services/session';
	import { userStore } from '$lib/stores/auth';

	// Use the reactive translation function
	let t = $derived($translate);

	let password = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Get user email for display
	let userEmail = $derived($userStore?.email || '');

	async function handleVerify() {
		if (!password) {
			error = t('auth.enterPassword');
			return;
		}

		isLoading = true;
		error = null;

		try {
			const result = await sessionManager.verifyPassword(password);

			if (result.success) {
				sessionManager.completeReauth(true);
				resetForm();
			} else {
				error = t('auth.incorrectPassword');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : t('auth.incorrectPassword');
		} finally {
			isLoading = false;
		}
	}

	function handleClose() {
		sessionManager.completeReauth(false);
		resetForm();
	}

	function resetForm() {
		password = '';
		error = null;
		isLoading = false;
	}
</script>

{#if $showReauthModal}
	<!-- Modal Overlay -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		onclick={handleClose}
		onkeydown={(e) => {
			if (e.key === 'Escape') handleClose();
		}}
		role="button"
		tabindex="0"
		aria-label="Close modal"
	>
		<!-- Modal Box -->
		<div
			class="animate-fade-in bg-card border-border relative w-full max-w-md rounded-2xl border p-8 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="text-muted-foreground hover:bg-muted hover:text-muted-foreground absolute top-4 right-4 rounded-full p-2"
				aria-label="Close"
			>
				<X class="h-5 w-5" />
			</button>

			<!-- Header -->
			<div class="mb-6 flex items-center gap-3">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"
				>
					<Shield class="h-6 w-6 text-amber-600 dark:text-amber-400" />
				</div>
				<div>
					<h2 class="text-foreground text-2xl font-bold">
						{t('auth.confirmYourIdentity')}
					</h2>
					<p class="text-muted-foreground text-sm">
						{t('auth.confirmYourIdentityDescription')}
					</p>
				</div>
			</div>

			<!-- Account Info -->
			{#if userEmail}
				<div class="dark:bg-card border-border mb-4 rounded-lg border bg-gray-50 p-3">
					<p class="text-muted-foreground text-xs">{t('auth.account')}</p>
					<p class="text-foreground font-medium">{userEmail}</p>
				</div>
			{/if}

			<!-- Error Message -->
			{#if error}
				<div
					class="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
				>
					<AlertCircle class="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
					<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
				</div>
			{/if}

			<!-- Password Input -->
			<div class="mb-6">
				<label for="reauth-password" class="text-muted-foreground mb-2 block text-sm font-medium">
					{t('auth.password')}
				</label>
				<div class="relative">
					<Lock class="text-muted-foreground absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
					<input
						id="reauth-password"
						type="password"
						bind:value={password}
						placeholder={t('auth.enterPasswordPlaceholder')}
						class="focus:ring-primary dark:border-border dark:text-foreground dark:placeholder:text-muted-foreground bg-card w-full rounded-lg border border-gray-300 py-3 pr-4 pl-10 text-gray-900 placeholder-gray-400 transition-colors focus:border-transparent focus:ring-2"
						disabled={isLoading}
						onkeydown={(e) => {
							if (e.key === 'Enter' && !isLoading && password) {
								handleVerify();
							}
						}}
					/>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="flex gap-3">
				<button
					onclick={handleClose}
					class="dark:border-border dark:text-muted-foreground hover:bg-muted flex-1 rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-700 transition-colors"
					disabled={isLoading}
				>
					{t('common.actions.cancel')}
				</button>
				<button
					onclick={handleVerify}
					class="bg-primary hover:bg-primary/90 flex-1 rounded-lg px-4 py-3 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
					disabled={isLoading || !password}
				>
					{#if isLoading}
						{t('common.status.verifying')}
					{:else}
						{t('auth.confirm')}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
