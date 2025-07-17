<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X, QrCode, Smartphone, Shield, CheckCircle, Copy, Download } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import QRCode from 'qrcode';
	import { onMount } from 'svelte';

	export let open = false;

	const dispatch = createEventDispatcher();

	let currentStep = 1;
	let qrCodeUrl = '';
	let secret = '';
	let verificationCode = '';
	let password = '';
	let isGenerating = false;
	let isVerifying = false;
	let qrCodeError = false;
	let recoveryCodes: string[] = [];
	let email = '';

	// Watch for changes to the open prop
	$: if (open && !qrCodeUrl && !qrCodeError) {
		// Don't auto-generate, wait for user to enter password
	}

	onMount(() => {
		console.log('TwoFactorSetup mounted, open:', open);
		// Don't auto-generate on mount
	});

	async function generateSecret() {
		if (!password) {
			toast.error('Please enter your password');
			return;
		}

		console.log('Generating 2FA secret...');
		isGenerating = true;
		qrCodeError = false;
		try {
			// Call the API endpoint directly
			const response = await fetch('/api/v1/auth/2fa/setup', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ password })
			});

			const responseData = await response.json();

			if (!response.ok || !responseData.success) {
				throw new Error(responseData.error?.message || 'Setup failed');
			}

			secret = responseData.data.secret;
			qrCodeUrl = responseData.data.qrCodeUrl;
			email = responseData.data.email || '';
		} catch (error) {
			console.error('Error generating 2FA secret:', error);
			qrCodeError = true;
			toast.error(
				'Failed to generate 2FA setup: ' +
					(error instanceof Error ? error.message : 'Unknown error')
			);
		} finally {
			isGenerating = false;
		}
	}

	async function verifyAndEnable() {
		if (!verificationCode) {
			toast.error('Please enter the verification code');
			return;
		}
		isVerifying = true;
		try {
			// Call the API endpoint directly
			const response = await fetch('/api/v1/auth/2fa/verify', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ code: verificationCode })
			});

			const responseData = await response.json();

			if (!response.ok || !responseData.success) {
				throw new Error(responseData.error?.message || 'Verification failed');
			}

			recoveryCodes = responseData.data.recoveryCodes || [];
			if (recoveryCodes.length > 0) {
				nextStep();
			} else {
				toast.success('Two-factor authentication enabled successfully!');
				dispatch('enabled');
				closeModal();
			}
		} catch (error) {
			console.error('Error enabling 2FA:', error);
			toast.error(
				'Failed to enable two-factor authentication: ' +
					(error instanceof Error ? error.message : 'Unknown error')
			);
		} finally {
			isVerifying = false;
		}
	}

	function copyCodes() {
		const codesString = recoveryCodes.join('\n');
		navigator.clipboard.writeText(codesString);
		toast.success('Recovery codes copied to clipboard');
	}

	function downloadCodes() {
		const codesString = recoveryCodes.join('\n');
		const blob = new Blob([codesString], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'wayli-recovery-codes.txt';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function finishSetup() {
		toast.success('Two-factor authentication enabled successfully!');
		dispatch('enabled');
		closeModal();
	}

	function closeModal() {
		open = false;
		currentStep = 1;
		verificationCode = '';
		password = '';
		qrCodeUrl = '';
		secret = '';
		qrCodeError = false;
		recoveryCodes = [];
		dispatch('close');
	}

	function nextStep() {
		currentStep++;
	}

	function prevStep() {
		currentStep--;
	}
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && closeModal()} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		on:click={closeModal}
		on:keydown={(event) => event.key === 'Escape' && closeModal()}
		role="presentation"
		tabindex="-1"
	>
		<!-- Modal -->
		<div
			class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800"
			on:click|stopPropagation
			on:keydown={(event) => event.key === 'Escape' && closeModal()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="two-factor-setup-modal-title"
			aria-describedby="two-factor-setup-modal-description"
			tabindex="-1"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700"
			>
				<div class="flex items-center gap-3">
					<Shield class="h-6 w-6 text-[rgb(37,140,244)]" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						Set Up Two-Factor Authentication
					</h2>
				</div>
				<button
					on:click={closeModal}
					class="cursor-pointer rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-6">
				{#if currentStep === 1}
					<!-- Step 1: QR Code Setup -->
					<div class="text-center">
						<div class="mb-6">
							<QrCode class="mx-auto mb-4 h-12 w-12 text-[rgb(37,140,244)]" />
							<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
								Set Up Two-Factor Authentication
							</h3>
							<p class="text-gray-600 dark:text-gray-400">Enter your password to begin 2FA setup</p>
						</div>

						{#if !qrCodeUrl && !isGenerating}
							<!-- Password input -->
							<div class="mb-6">
								<label
									for="setupPassword"
									class="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100"
								>
									Enter Your Password
								</label>
								<input
									id="setupPassword"
									type="password"
									bind:value={password}
									placeholder="Enter your password"
									class="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								/>
							</div>

							<button
								on:click={generateSecret}
								disabled={!password}
								class="mb-6 w-full cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								Generate QR Code
							</button>
						{:else if isGenerating}
							<div class="flex items-center justify-center py-8">
								<div class="text-center">
									<div
										class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-[rgb(37,140,244)]"
									></div>
									<p class="text-sm text-gray-600 dark:text-gray-400">Generating QR code...</p>
								</div>
							</div>
						{:else if qrCodeUrl}
							<div class="mb-6">
								<h4 class="mb-2 font-medium text-gray-900 dark:text-gray-100">Scan QR Code</h4>
								<p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
									Use your authenticator app to scan this QR code
								</p>
								<img
									src={qrCodeUrl}
									alt="2FA QR Code"
									class="mx-auto rounded-lg border border-gray-200 dark:border-gray-700"
								/>
							</div>
						{:else if qrCodeError && secret}
							<div
								class="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20"
							>
								<h4 class="mb-2 font-medium text-yellow-800 dark:text-yellow-200">
									Manual Setup Required
								</h4>
								<p class="mb-3 text-sm text-yellow-700 dark:text-yellow-300">
									QR code generation failed. Please manually add this secret to your authenticator
									app:
								</p>
								<div
									class="rounded border border-yellow-200 bg-white p-3 dark:border-yellow-800 dark:bg-gray-800"
								>
									<code class="font-mono text-sm break-all text-gray-900 dark:text-gray-100"
										>{secret}</code
									>
								</div>
								<p class="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
									Account: {email} | Issuer: Wayli
								</p>
							</div>
						{/if}

						{#if qrCodeUrl || (qrCodeError && secret)}
							<div class="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
								<h4 class="mb-2 font-medium text-gray-900 dark:text-gray-100">
									Popular Authenticator Apps:
								</h4>
								<ul class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
									<li>• Aegis</li>
									<li>• Authy</li>
									<li>• Bitwarden</li>
									<li>• 1Password</li>
									<li>• Microsoft Authenticator</li>
									<li>• Google Authenticator</li>
								</ul>
							</div>

							<button
								on:click={nextStep}
								class="w-full cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 font-medium text-white hover:bg-[rgb(37,140,244)]/90"
							>
								Next: Verify Code
							</button>
						{/if}
					</div>
				{:else if currentStep === 2}
					<!-- Step 2: Verification -->
					<div class="text-center">
						<div class="mb-6">
							<Smartphone class="mx-auto mb-4 h-12 w-12 text-[rgb(37,140,244)]" />
							<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
								Enter Verification Code
							</h3>
							<p class="text-gray-600 dark:text-gray-400">
								Enter the 6-digit code from your authenticator app
							</p>
						</div>

						<div class="mb-6">
							<input
								type="text"
								bind:value={verificationCode}
								placeholder="000000"
								maxlength="6"
								class="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-widest text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
							/>
						</div>

						<div class="flex gap-3">
							<button
								on:click={prevStep}
								class="flex-1 cursor-pointer rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
							>
								Back
							</button>
							<button
								on:click={verifyAndEnable}
								disabled={isVerifying || verificationCode.length !== 6}
								class="flex-1 cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{isVerifying ? 'Verifying...' : 'Enable 2FA'}
							</button>
						</div>
					</div>
				{:else if currentStep === 3}
					<!-- Step 3: Recovery Codes -->
					<div class="text-center">
						<div class="mb-6">
							<CheckCircle class="mx-auto mb-4 h-12 w-12 text-green-500" />
							<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
								2FA Enabled! Save Your Recovery Codes
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Store these codes in a safe place. They can be used to access your account if you
								lose your device.
							</p>
						</div>

						<div
							class="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-gray-100 p-4 text-center font-mono text-gray-800 dark:bg-gray-900/50 dark:text-gray-200"
						>
							{#each recoveryCodes as code}
								<p>{code}</p>
							{/each}
						</div>

						<div class="mb-4 flex gap-3">
							<button
								on:click={copyCodes}
								class="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
							>
								<Copy class="h-4 w-4" />
								Copy
							</button>
							<button
								on:click={downloadCodes}
								class="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
							>
								<Download class="h-4 w-4" />
								Download
							</button>
						</div>

						<button
							on:click={finishSetup}
							class="w-full cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 font-medium text-white hover:bg-[rgb(37,140,244)]/90"
						>
							Finish Setup
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
