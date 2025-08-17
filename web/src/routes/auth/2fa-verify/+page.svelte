<script lang="ts">
	import { Shield, Smartphone, ArrowLeft, Key, Loader2 } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { EdgeFunctionsApiService } from '$lib/services/api/edge-functions-api.service';
	import { supabase } from '$lib/supabase';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let verificationCode = '';
	let recoveryCode = '';
	let isVerifying = false;
	let useRecoveryCode = false;
	let userEmail = '';
	let pendingUserEmail = '';
	let pendingPassword = '';

	onMount(() => {
		// Get credentials from URL params or session storage
		const params = new URLSearchParams(window.location.search);
		pendingUserEmail = params.get('email') || '';
		pendingPassword = params.get('password') || '';
		userEmail = pendingUserEmail;

		if (!pendingUserEmail || !pendingPassword) {
			toast.error('Missing login credentials. Please sign in again.');
			goto('/auth/signin');
		}
	});

	async function handleVerify() {
		if (useRecoveryCode) {
			if (!recoveryCode) {
				toast.error('Please enter your recovery code');
				return;
			}

			isVerifying = true;
			try {
				// First, sign in with stored credentials to get a valid session
				const { data, error } = await supabase.auth.signInWithPassword({
					email: pendingUserEmail,
					password: pendingPassword
				});

				if (error) throw error;

				if (data.session) {
					// Handle recovery code verification
					const edgeService = new EdgeFunctionsApiService();
					await edgeService.recover2FA(data.session, recoveryCode);

					// 2FA verification successful - user is now fully authenticated
					toast.success('Signed in successfully');

					// Redirect to intended destination
					const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
					goto(redirectTo, { replaceState: true });
				} else {
					toast.error('No session returned from authentication');
				}
			} catch (error: any) {
				console.error('2FA recovery error:', error);
				toast.error(error.message || 'Recovery code verification failed');
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
				// First, sign in with stored credentials to get a valid session
				const { data, error } = await supabase.auth.signInWithPassword({
					email: pendingUserEmail,
					password: pendingPassword
				});

				if (error) throw error;

				if (data.session) {
					// Handle 2FA code verification
					const edgeService = new EdgeFunctionsApiService();
					await edgeService.verify2FA(data.session, verificationCode);

					// 2FA verification successful - user is now fully authenticated
					toast.success('Signed in successfully');

					// Redirect to intended destination
					const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
					goto(redirectTo, { replaceState: true });
				} else {
					toast.error('No session returned from authentication');
				}
			} catch (error: any) {
				console.error('2FA verification error:', error);
				toast.error(error.message || 'Verification failed');
			} finally {
				isVerifying = false;
			}
		}
	}

	function handleBack() {
		// Clear any stored credentials and go back to signin
		goto('/auth/signin');
	}

	function toggleMode() {
		useRecoveryCode = !useRecoveryCode;
		verificationCode = '';
		recoveryCode = '';
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
	<div class="w-full max-w-md">
		<!-- Back to signin -->
		<div class="mb-8">
			<button
				on:click={handleBack}
				class="inline-flex items-center text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
			>
				<ArrowLeft class="mr-2 h-4 w-4" />
				Back to sign in
			</button>
		</div>

		<!-- 2FA Verification Form -->
		<div
			class="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mb-8 text-center">
				<div
					class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(37,140,244)]"
				>
					<Shield class="h-6 w-6 text-white" />
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
					Two-Factor Authentication
				</h1>
				<p class="text-gray-600 dark:text-gray-400">Please verify your identity to continue</p>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-500">
					Account: {userEmail}
				</p>
			</div>

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
						class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center font-mono text-lg tracking-wider text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-2 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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
						class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-widest text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-2 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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

			<!-- Verify Button -->
			<button
				on:click={handleVerify}
				disabled={isVerifying || (useRecoveryCode ? !recoveryCode : verificationCode.length !== 6)}
				class="w-full cursor-pointer rounded-lg bg-[rgb(37,140,244)] px-4 py-3 font-medium text-white transition-colors hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if isVerifying}
					<Loader2 class="mr-2 inline h-4 w-4 animate-spin" />
					Verifying...
				{:else}
					Verify & Sign In
				{/if}
			</button>
		</div>
	</div>
</div>
