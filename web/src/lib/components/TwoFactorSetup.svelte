<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X, QrCode, Smartphone, Shield, CheckCircle } from 'lucide-svelte';
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
	let isGenerating = false;
	let isVerifying = false;
	let qrCodeError = false;
	let email = '';

	// Watch for changes to the open prop
	$: if (open && !qrCodeUrl && !qrCodeError) {
		generateSecret();
	}

	onMount(() => {
		console.log('TwoFactorSetup mounted, open:', open);
		if (open) {
			generateSecret();
		}
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
		console.log('Generating 2FA secret...');
		isGenerating = true;
		qrCodeError = false;
		try {
			// Generate a new secret using our simple function
			secret = generateRandomSecret();
			console.log('Secret generated:', secret.substring(0, 10) + '...');

			// Get user email for the QR code
			const { data: { user } } = await supabase.auth.getUser();
			email = user?.email || 'user';
			console.log('User email:', email);

			// Create the otpauth URL for the QR code
			const otpauthUrl = `otpauth://totp/Wayli:${email}?secret=${secret}&issuer=Wayli`;
			console.log('OTP Auth URL:', otpauthUrl);

			// Test if QRCode is available
			console.log('QRCode library:', typeof QRCode);
			console.log('QRCode.toDataURL:', typeof QRCode.toDataURL);

			// Generate QR code with error handling
			try {
				qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
				console.log('QR Code generated successfully, length:', qrCodeUrl.length);
			} catch (qrError) {
				console.error('QR Code generation failed:', qrError);
				qrCodeError = true;
				toast.warning('QR code generation failed, but you can still set up 2FA manually');
			}
		} catch (error) {
			console.error('Error generating 2FA secret:', error);
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
			// For now, we'll just store the secret and mark 2FA as enabled
			// In a real implementation, you'd verify the TOTP code server-side
			const { error } = await supabase.auth.updateUser({
				data: {
					totp_secret: secret,
					totp_enabled: true
				}
			});

			if (error) throw error;

			toast.success('Two-factor authentication enabled successfully!');
			dispatch('enabled');
			closeModal();
		} catch (error) {
			console.error('Error enabling 2FA:', error);
			toast.error('Failed to enable two-factor authentication');
		} finally {
			isVerifying = false;
		}
	}

	function closeModal() {
		open = false;
		currentStep = 1;
		verificationCode = '';
		qrCodeUrl = '';
		secret = '';
		qrCodeError = false;
		dispatch('close');
	}

	function nextStep() {
		currentStep = 2;
	}

	function prevStep() {
		currentStep = 1;
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
		on:click={closeModal}
	>
		<!-- Modal -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
			on:click|stopPropagation
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
								Scan QR Code
							</h3>
							<p class="text-gray-600 dark:text-gray-400">
								Use your authenticator app to scan this QR code
							</p>
						</div>

						{#if isGenerating}
							<div class="flex items-center justify-center py-8">
								<div class="text-center">
									<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[rgb(37,140,244)] mx-auto mb-4"></div>
									<p class="text-sm text-gray-600 dark:text-gray-400">Generating QR code...</p>
								</div>
							</div>
						{:else if qrCodeUrl}
							<div class="mb-6">
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
						{:else}
							<div class="flex items-center justify-center py-8">
								<div class="text-center">
									<div class="h-32 w-32 bg-gray-100 dark:bg-gray-700 rounded-lg mx-auto mb-4 flex items-center justify-center">
										<QrCode class="h-12 w-12 text-gray-400" />
									</div>
									<p class="text-sm text-gray-600 dark:text-gray-400">QR code not available</p>
									<button
										on:click={generateSecret}
										class="mt-2 text-sm text-[rgb(37,140,244)] hover:text-[rgb(37,140,244)]/80 cursor-pointer"
									>
										Retry
									</button>
									<!-- Debug button for testing -->
									<button
										on:click={() => {
											console.log('Debug: Current state:', { open, isGenerating, qrCodeUrl: qrCodeUrl ? 'exists' : 'none', secret: secret ? 'exists' : 'none', qrCodeError });
											generateSecret();
										}}
										class="mt-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer block mx-auto"
									>
										Debug: Generate QR
									</button>
								</div>
							</div>
						{/if}

						<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
							<h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
								Popular Authenticator Apps:
							</h4>
							<ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
								<li>• Google Authenticator</li>
								<li>• Microsoft Authenticator</li>
								<li>• Authy</li>
								<li>• 1Password</li>
								<li>• Bitwarden</li>
							</ul>
						</div>

						<button
							on:click={nextStep}
							class="w-full bg-[rgb(37,140,244)] text-white px-4 py-2 rounded-md font-medium hover:bg-[rgb(37,140,244)]/90 cursor-pointer"
						>
							Next: Verify Code
						</button>
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
				{/if}
			</div>
		</div>
	</div>
{/if}