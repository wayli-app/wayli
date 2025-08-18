<script lang="ts">
	import { X, QrCode, Smartphone, Shield, CheckCircle, Copy, Download } from 'lucide-svelte';
	import QRCode from 'qrcode';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { supabase } from '$lib/supabase';

	export let open = false;
	export let onEnabled: (() => void) | undefined = undefined;
	export let onClose: (() => void) | undefined = undefined;

	// Types
	interface TwoFASetupResponse {
		secret: string;
		qrCodeUrl: string;
		email?: string;
	}

	interface TwoFAVerifyResponse {
		recoveryCodes: string[];
	}

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
		console.log('Generating 2FA secret...');
		isGenerating = true;
		qrCodeError = false;
		try {
			// Get current session and use ServiceAdapter
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const responseData = (await serviceAdapter.setup2FA('generate', '')) as TwoFASetupResponse; // Action: generate, no token needed

			secret = responseData.secret;
			// Generate QR code image from the otpauth URL
			qrCodeUrl = await QRCode.toDataURL(responseData.qrCodeUrl);
			email = responseData.email || '';
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
			// Get current session and use ServiceAdapter
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const responseData = (await serviceAdapter.setup2FA(
				'verify',
				verificationCode
			)) as TwoFAVerifyResponse; // Action: verify, token as verification code

			recoveryCodes = responseData.recoveryCodes || [];
			if (recoveryCodes.length > 0) {
				nextStep();
			} else {
				toast.success('Two-factor authentication enabled successfully!');
				if (onEnabled) {
					onEnabled();
				}
				closeModal();
			}
		} catch (error) {
			console.error('Error verifying 2FA:', error);
			toast.error(
				'Failed to verify 2FA: ' + (error instanceof Error ? error.message : 'Unknown error')
			);
		} finally {
			isVerifying = false;
		}
	}

	function nextStep() {
		currentStep++;
	}

	function prevStep() {
		currentStep--;
	}

	function closeModal() {
		open = false;
		currentStep = 1;
		qrCodeUrl = '';
		secret = '';
		verificationCode = '';
		password = '';
		qrCodeError = false;
		recoveryCodes = [];
		email = '';
		if (onClose) {
			onClose();
		}
	}

	function finishSetup() {
		toast.success('Two-factor authentication setup completed!');
		if (onEnabled) {
			onEnabled();
		}
		closeModal();
	}

	function copyCodes() {
		const codesText = recoveryCodes.join('\n');
		navigator.clipboard.writeText(codesText).then(() => {
			toast.success('Recovery codes copied to clipboard');
		});
	}

	function downloadCodes() {
		const codesText = recoveryCodes.join('\n');
		const blob = new Blob([codesText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'recovery-codes.txt';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		toast.success('Recovery codes downloaded');
	}
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && closeModal()} />

{#if open}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
		onclick={closeModal}
		role="presentation"
		aria-hidden="true"
	>
		<div
			class="relative w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-800"
			onclick={(e) => e.stopPropagation()}
			role="document"
		>
			<!-- Modal Header -->
			<div
				class="mb-6 flex items-start justify-between border-b border-gray-200 p-6 dark:border-gray-700"
			>
				<div>
					<h2
						id="two-factor-setup-modal-title"
						class="text-2xl font-bold text-gray-900 dark:text-gray-100"
					>
						Set Up Two-Factor Authentication
					</h2>
					<p class="text-gray-500 dark:text-gray-400">
						Secure your account with an authenticator app
					</p>
				</div>
				<button
					onclick={closeModal}
					class="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
					aria-label="Close modal"
				>
					<X class="h-6 w-6" />
				</button>
			</div>

			<!-- Modal Content -->
			<div class="p-6">
				{#if currentStep === 1}
					<!-- Step 1: Password Entry and QR Code Generation -->
					<div class="text-center">
						<div class="mb-6">
							<Shield class="mx-auto mb-4 h-12 w-12 text-[rgb(37,140,244)]" />
							<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
								Enter Your Password
							</h3>
							<p class="text-gray-600 dark:text-gray-400">
								Enter your password to generate a QR code for your authenticator app
							</p>
						</div>

						<div class="mb-6">
							<input
								type="password"
								bind:value={password}
								placeholder="Enter your password"
								class="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
							/>
						</div>

						{#if !qrCodeUrl && !qrCodeError}
							<button
								onclick={generateSecret}
								disabled={isGenerating || !password}
								class="w-full cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{isGenerating ? 'Generating...' : 'Generate QR Code'}
							</button>
						{:else if qrCodeError}
							<div
								class="mb-4 rounded-md bg-red-50 p-3 text-red-700 dark:bg-red-900/20 dark:text-red-300"
							>
								Failed to generate QR code. Please try again.
							</div>
							<button
								onclick={generateSecret}
								disabled={isGenerating || !password}
								class="w-full cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{isGenerating ? 'Generating...' : 'Retry'}
							</button>
						{:else if qrCodeUrl}
							<div class="mb-6">
								<div class="mb-4">
									<QrCode class="mx-auto h-32 w-32" />
								</div>
								<div class="mb-4">
									<img src={qrCodeUrl} alt="QR Code" class="mx-auto h-32 w-32" />
								</div>
								<p class="text-sm text-gray-600 dark:text-gray-400">
									Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
								</p>
								{#if email}
									<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
										Or manually enter the secret: <code
											class="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-700">{secret}</code
										>
									</p>
								{/if}
							</div>

							<button
								onclick={nextStep}
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
								onclick={prevStep}
								class="flex-1 cursor-pointer rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
							>
								Back
							</button>
							<button
								onclick={verifyAndEnable}
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
							{#each recoveryCodes as code (code)}
								<p>{code}</p>
							{/each}
						</div>

						<div class="mb-4 flex gap-3">
							<button
								onclick={copyCodes}
								class="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
							>
								<Copy class="h-4 w-4" />
								Copy
							</button>
							<button
								onclick={downloadCodes}
								class="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
							>
								<Download class="h-4 w-4" />
								Download
							</button>
						</div>

						<button
							onclick={finishSetup}
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
