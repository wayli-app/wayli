<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X, QrCode, Smartphone, Shield, CheckCircle, Copy, Download } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import QRCode from 'qrcode';
	import { onMount } from 'svelte';
	import { UserService } from '$lib/services/user.service';

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

	// Simple secret generation function
	function generateRandomSecret(length = 32) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}

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
				throw new Error(responseData.message || 'Setup failed');
			}

			secret = responseData.secret;
			qrCodeUrl = responseData.qrCodeUrl;
			// Optionally set email if needed
		} catch (error) {
			console.error('Error generating 2FA secret:', error);
			qrCodeError = true;
			toast.error('Failed to generate 2FA setup: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
				throw new Error(responseData.message || 'Verification failed');
			}

			recoveryCodes = responseData.recoveryCodes || [];
			if (recoveryCodes.length > 0) {
				nextStep();
			} else {
				toast.success('Two-factor authentication enabled successfully!');
				dispatch('enabled');
				closeModal();
			}
		} catch (error) {
			console.error('Error enabling 2FA:', error);
			toast.error('Failed to enable two-factor authentication: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
		class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
		on:click={closeModal}
		on:keydown={(event) => event.key === 'Escape' && closeModal()}
		role="presentation"
		tabindex="-1"
	>
		<!-- Modal -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
			on:click|stopPropagation
			on:keydown={(event) => event.key === 'Escape' && closeModal()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="two-factor-setup-modal-title"
			aria-describedby="two-factor-setup-modal-description"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
				<div class="flex items-center gap-3">
					<Shield class="h-6 w-6 text-[rgb(37,140,244)]" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						Set Up Two-Factor Authentication
					</h2>
				</div>
				<button
					on:click={closeModal}
					class="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
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
							<QrCode class="h-12 w-12 text-[rgb(37,140,244)] mx-auto mb-4" />
							<h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
								Set Up Two-Factor Authentication
							</h3>
							<p class="text-gray-600 dark:text-gray-400">
								Enter your password to begin 2FA setup
							</p>
						</div>

						{#if !qrCodeUrl && !isGenerating}
							<!-- Password input -->
							<div class="mb-6">
								<label for="setupPassword" class="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
									Enter Your Password
								</label>
								<input
									id="setupPassword"
									type="password"
									bind:value={password}
									placeholder="Enter your password"
									class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
								/>
							</div>

							<button
								on:click={generateSecret}
								disabled={!password}
								class="w-full bg-[rgb(37,140,244)] text-white px-4 py-2 rounded-md font-medium hover:bg-[rgb(37,140,244)]/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mb-6"
							>
								Generate QR Code
							</button>
						{:else if isGenerating}
							<div class="flex items-center justify-center py-8">
								<div class="text-center">
									<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[rgb(37,140,244)] mx-auto mb-4"></div>
									<p class="text-sm text-gray-600 dark:text-gray-400">Generating QR code...</p>
								</div>
							</div>
						{:else if qrCodeUrl}
							<div class="mb-6">
								<h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
									Scan QR Code
								</h4>
								<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
									Use your authenticator app to scan this QR code
								</p>
								<img
									src={qrCodeUrl}
									alt="2FA QR Code"
									class="mx-auto border border-gray-200 dark:border-gray-700 rounded-lg"
								/>
							</div>
						{:else if qrCodeError && secret}
							<div class="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
								<h4 class="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
									Manual Setup Required
								</h4>
								<p class="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
									QR code generation failed. Please manually add this secret to your authenticator app:
								</p>
								<div class="bg-white dark:bg-gray-800 p-3 rounded border border-yellow-200 dark:border-yellow-800">
									<code class="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">{secret}</code>
								</div>
								<p class="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
									Account: {email} | Issuer: Wayli
								</p>
							</div>
						{/if}

						{#if qrCodeUrl || (qrCodeError && secret)}
							<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
								<h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
									Popular Authenticator Apps:
								</h4>
								<ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
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
								class="w-full bg-[rgb(37,140,244)] text-white px-4 py-2 rounded-md font-medium hover:bg-[rgb(37,140,244)]/90 cursor-pointer"
							>
								Next: Verify Code
							</button>
						{/if}
					</div>
				{:else if currentStep === 2}
					<!-- Step 2: Verification -->
					<div class="text-center">
						<div class="mb-6">
							<Smartphone class="h-12 w-12 text-[rgb(37,140,244)] mx-auto mb-4" />
							<h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
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
								class="w-full text-center text-2xl font-mono tracking-widest px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
							/>
						</div>

						<div class="flex gap-3">
							<button
								on:click={prevStep}
								class="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md font-medium hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
							>
								Back
							</button>
							<button
								on:click={verifyAndEnable}
								disabled={isVerifying || verificationCode.length !== 6}
								class="flex-1 bg-[rgb(37,140,244)] text-white px-4 py-2 rounded-md font-medium hover:bg-[rgb(37,140,244)]/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isVerifying ? 'Verifying...' : 'Enable 2FA'}
							</button>
						</div>
					</div>
				{:else if currentStep === 3}
					<!-- Step 3: Recovery Codes -->
					<div class="text-center">
						<div class="mb-6">
							<CheckCircle class="h-12 w-12 text-green-500 mx-auto mb-4" />
							<h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
								2FA Enabled! Save Your Recovery Codes
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Store these codes in a safe place. They can be used to access your account if you lose your device.
							</p>
						</div>

						<div class="grid grid-cols-2 gap-4 mb-6 text-center font-mono text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-900/50 p-4 rounded-lg">
							{#each recoveryCodes as code}
								<p>{code}</p>
							{/each}
						</div>

						<div class="flex gap-3 mb-4">
							<button on:click={copyCodes} class="flex-1 inline-flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md font-medium hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
								<Copy class="h-4 w-4" />
								Copy
							</button>
							<button on:click={downloadCodes} class="flex-1 inline-flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md font-medium hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
								<Download class="h-4 w-4" />
								Download
							</button>
						</div>

						<button
							on:click={finishSetup}
							class="w-full bg-[rgb(37,140,244)] text-white px-4 py-2 rounded-md font-medium hover:bg-[rgb(37,140,244)]/90 cursor-pointer"
						>
							Finish Setup
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}