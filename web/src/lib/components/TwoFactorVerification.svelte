<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Shield, Smartphone, ArrowLeft, Key } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	export let open = false;
	export let userEmail = '';

	const dispatch = createEventDispatcher();

	let verificationCode = '';
	let recoveryCode = '';
	let isVerifying = false;
	let useRecoveryCode = false;

	async function handleVerify() {
		if (useRecoveryCode) {
			if (!recoveryCode) {
				toast.error('Please enter your recovery code');
				return;
			}
			isVerifying = true;
			try {
				// Dispatch the recovery code to the parent component
				dispatch('verify', { recoveryCode });
			} catch (error) {
				console.error('Error during recovery code verification:', error);
				toast.error('Recovery code verification failed');
			} finally {
				isVerifying = false;
			}
		} else {
			if (!verificationCode) {
				toast.error('Please enter the verification code');
				return;
			}

			if (verificationCode.length !== 6) {
				toast.error('Please enter a 6-digit verification code');
				return;
			}

			isVerifying = true;
			try {
				// Dispatch the verification code to the parent component
				dispatch('verify', { code: verificationCode });
			} catch (error) {
				console.error('Error during verification:', error);
				toast.error('Verification failed');
			} finally {
				isVerifying = false;
			}
		}
	}

	function handleBack() {
		dispatch('back');
	}

	function handleCancel() {
		verificationCode = '';
		recoveryCode = '';
		useRecoveryCode = false;
		dispatch('cancel');
	}

	function toggleMode() {
		useRecoveryCode = !useRecoveryCode;
		verificationCode = '';
		recoveryCode = '';
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
		on:click={handleCancel}
		on:keydown={(e) => e.key === 'Escape' && handleCancel()}
		aria-modal="true"
		role="dialog"
		aria-labelledby="two-factor-modal-title"
		aria-describedby="two-factor-modal-description"
		tabindex="-1"
	>
		<!-- Modal -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
			on:click|stopPropagation
			on:keydown|stopPropagation
			aria-modal="true"
			role="dialog"
			aria-labelledby="two-factor-modal-title"
			aria-describedby="two-factor-modal-description"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
				<div class="flex items-center gap-3">
					<Shield class="h-6 w-6 text-[rgb(37,140,244)]" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						Two-Factor Authentication
					</h2>
				</div>
			</div>

			<!-- Content -->
			<div class="p-6">
				<div class="text-center mb-6">
					{#if useRecoveryCode}
						<Key class="h-12 w-12 text-[rgb(37,140,244)] mx-auto mb-4" />
						<h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
							Enter Recovery Code
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							Enter one of your recovery codes to sign in
						</p>
					{:else}
						<Smartphone class="h-12 w-12 text-[rgb(37,140,244)] mx-auto mb-4" />
						<h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
							Enter Verification Code
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							Please enter the 6-digit code from your authenticator app
						</p>
					{/if}
					<p class="text-sm text-gray-500 dark:text-gray-500 mt-1">
						Account: {userEmail}
					</p>
				</div>

				{#if useRecoveryCode}
					<div class="mb-6">
						<label for="recoveryCode" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Recovery Code
						</label>
						<input
							id="recoveryCode"
							type="text"
							bind:value={recoveryCode}
							placeholder="Enter recovery code"
							class="w-full text-center text-lg font-mono tracking-wider px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>
				{:else}
					<div class="mb-6">
						<label for="verificationCode" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Verification Code
						</label>
						<input
							id="verificationCode"
							type="text"
							bind:value={verificationCode}
							placeholder="000000"
							maxlength="6"
							class="w-full text-center text-2xl font-mono tracking-widest px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>
				{/if}

				<!-- Mode Toggle -->
				<div class="mb-6 text-center">
					<button
						on:click={toggleMode}
						class="text-sm text-[rgb(37,140,244)] hover:text-[rgb(37,140,244)]/80 transition-colors cursor-pointer"
					>
						{#if useRecoveryCode}
							Use authenticator app instead
						{:else}
							Use recovery code instead
						{/if}
					</button>
				</div>

				<!-- Action Buttons -->
				<div class="flex gap-3">
					<button
						on:click={handleBack}
						class="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md font-medium hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
					>
						<ArrowLeft class="h-4 w-4 inline mr-2" />
						Back
					</button>
					<button
						on:click={handleVerify}
						disabled={isVerifying || (useRecoveryCode ? !recoveryCode : verificationCode.length !== 6)}
						class="flex-1 bg-[rgb(37,140,244)] text-white px-4 py-2 rounded-md font-medium hover:bg-[rgb(37,140,244)]/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isVerifying ? 'Verifying...' : 'Verify & Sign In'}
					</button>
				</div>

				<div class="mt-4 text-center">
					<button
						on:click={handleCancel}
						class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}