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

	function handleRecoveryCodeSubmit() {
		if (!recoveryCode.trim()) return;
		dispatch('verify', { recoveryCode });
	}

	function handleCodeSubmit() {
		if (!verificationCode.trim()) return;
		dispatch('verify', { code: verificationCode });
	}

	function handleBack() {
		dispatch('back', undefined);
	}

	function handleCancel() {
		dispatch('cancel', undefined);
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
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
		on:click={handleCancel}
		on:keydown={(e) => e.key === 'Escape' && handleCancel()}
		role="presentation"
		aria-hidden="true"
	>
		<!-- Modal -->
		<div
			class="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-800"
			on:click|stopPropagation
			on:keydown|stopPropagation
			aria-modal="true"
			role="dialog"
			aria-labelledby="two-factor-modal-title"
			aria-describedby="two-factor-modal-description"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700"
			>
				<div class="flex items-center gap-3">
					<Shield class="h-6 w-6 text-[rgb(37,140,244)]" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						Two-Factor Authentication
					</h2>
				</div>
			</div>

			<!-- Content -->
			<div class="p-6">
				<div class="mb-6 text-center">
					{#if useRecoveryCode}
						<Key class="mx-auto mb-4 h-12 w-12 text-[rgb(37,140,244)]" />
						<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
							Enter Recovery Code
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							Enter one of your recovery codes to sign in
						</p>
					{:else}
						<Smartphone class="mx-auto mb-4 h-12 w-12 text-[rgb(37,140,244)]" />
						<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
							Enter Verification Code
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							Please enter the 6-digit code from your authenticator app
						</p>
					{/if}
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-500">
						Account: {userEmail}
					</p>
				</div>

				{#if useRecoveryCode}
					<div class="mb-6">
						<label
							for="recoveryCode"
							class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Recovery Code
						</label>
						<input
							id="recoveryCode"
							type="text"
							bind:value={recoveryCode}
							placeholder="Enter recovery code"
							class="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-center font-mono text-lg tracking-wider text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
						/>
					</div>
				{:else}
					<div class="mb-6">
						<label
							for="verificationCode"
							class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Verification Code
						</label>
						<input
							id="verificationCode"
							type="text"
							bind:value={verificationCode}
							placeholder="000000"
							maxlength="6"
							class="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-widest text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
						/>
					</div>
				{/if}

				<!-- Mode Toggle -->
				<div class="mb-6 text-center">
					<button
						on:click={toggleMode}
						class="cursor-pointer text-sm text-[rgb(37,140,244)] transition-colors hover:text-[rgb(37,140,244)]/80"
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
						class="flex-1 cursor-pointer rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
					>
						<ArrowLeft class="mr-2 inline h-4 w-4" />
						Back
					</button>
					<button
						on:click={handleVerify}
						disabled={isVerifying ||
							(useRecoveryCode ? !recoveryCode : verificationCode.length !== 6)}
						class="flex-1 cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isVerifying ? 'Verifying...' : 'Verify & Sign In'}
					</button>
				</div>

				<div class="mt-4 text-center">
					<button
						on:click={handleCancel}
						class="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
