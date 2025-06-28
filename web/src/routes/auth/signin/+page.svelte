<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { userStore, isInTwoFactorFlow } from '$lib/stores/auth';
	import { Mail, Lock, Eye, EyeOff, Github, Chrome, ArrowLeft, LogIn } from 'lucide-svelte';
	import { page } from '$app/stores';
	import TwoFactorVerification from '$lib/components/TwoFactorVerification.svelte';

	let email = '';
	let password = '';
	let loading = false;
	let showPassword = false;
	let isMagicLinkSent = false;
	let showTwoFactorVerification = false;
	let pendingUserEmail = '';
	let pendingPassword = '';
	let unsubscribeFromUserStore: (() => void) | null = null;

	onMount(() => {
		console.log('🔐 [SIGNIN] Page mounted');
		// Check if user is already authenticated
		(async () => {
			const { data: { user } } = await supabase.auth.getUser();
			console.log('🔐 [SIGNIN] User check:', user ? `Found - ${user.email}` : 'None');

			if (user) {
				// Only redirect if we're on the signin page
				if ($page.url.pathname.startsWith('/auth/signin')) {
					// User is already authenticated, redirect to intended destination or default
					const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
					console.log('🔄 [SIGNIN] REDIRECTING: User already authenticated, going to', redirectTo);
					goto(redirectTo);
					return;
				}
			}
		})();

		// Subscribe to auth changes for future logins
		unsubscribeFromUserStore = userStore.subscribe(user => {
			console.log('🔐 [SIGNIN] User store updated:', user ? `User: ${user.email}` : 'No user');

			// Get current 2FA flow state
			let currentTwoFactorState = false;
			isInTwoFactorFlow.subscribe(state => {
				currentTwoFactorState = state;
			})();

			if (user && !currentTwoFactorState) {
				// Only redirect if we're on the signin page and not in 2FA flow
				if ($page.url.pathname.startsWith('/auth/signin')) {
					const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
					console.log('🔄 [SIGNIN] REDIRECTING: User authenticated, going to', redirectTo);
					goto(redirectTo);
				}
			}
		});

		return unsubscribeFromUserStore;
	});

	function resubscribeToUserStore() {
		console.log('🔐 [SIGNIN] Resubscribing to userStore');
		unsubscribeFromUserStore = userStore.subscribe(user => {
			console.log('🔐 [SIGNIN] User store updated:', user ? `User: ${user.email}` : 'No user');

			// Get current 2FA flow state
			let currentTwoFactorState = false;
			isInTwoFactorFlow.subscribe(state => {
				currentTwoFactorState = state;
			})();

			if (user && !currentTwoFactorState) {
				// Only redirect if we're on the signin page and not in 2FA flow
				if ($page.url.pathname.startsWith('/auth/signin')) {
					const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
					console.log('🔄 [SIGNIN] REDIRECTING: User authenticated, going to', redirectTo);
					goto(redirectTo);
				}
			}
		});
	}

	async function handleSignIn(event: Event) {
		event.preventDefault();
		loading = true;

		try {
			// First, check if the user has 2FA enabled
			const checkResponse = await fetch('/api/v1/auth/check-2fa', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email })
			});

			const checkResult = await checkResponse.json();

			if (!checkResponse.ok) {
				throw new Error(checkResult.error || 'Failed to check 2FA status');
			}

			const has2FA = checkResult.has2FA;

			if (has2FA) {
				// Set 2FA flow state IMMEDIATELY to prevent redirects
				isInTwoFactorFlow.set(true);

				// Store credentials for 2FA verification
				pendingUserEmail = email;
				pendingPassword = password;

				// Show 2FA verification modal
				showTwoFactorVerification = true;

				console.log('🔐 [SIGNIN] 2FA flow started, unsubscribing from userStore');

				// Unsubscribe from userStore to prevent automatic redirects
				if (unsubscribeFromUserStore) {
					unsubscribeFromUserStore();
					unsubscribeFromUserStore = null;
				}

				toast.info('Please enter your 2FA verification code');
			} else {
				// No 2FA enabled, proceed with normal login
				const { data, error } = await supabase.auth.signInWithPassword({
					email,
					password
				});

				if (error) throw error;

				if (data.session) {
					toast.success('Signed in successfully');

					// Force a small delay to ensure auth state is updated
					await new Promise(resolve => setTimeout(resolve, 500));

					// Double-check the user and redirect
					const { data: { user: currentUser } } = await supabase.auth.getUser();
					if (currentUser) {
						const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
						console.log('🔄 [SIGNIN] REDIRECTING: Login successful, going to', redirectTo);
						goto(redirectTo, { replaceState: true });
					} else {
						console.log('❌ [SIGNIN] ERROR: User not found after authentication');
						toast.error('User not found after authentication');
					}
				} else {
					toast.error('No session returned from authentication');
				}
			}
		} catch (error: any) {
			console.error('Sign in error:', error);
			toast.error(error.message || 'Sign in failed');
		} finally {
			loading = false;
		}
	}

	async function handleMagicLink() {
		if (!email) {
			toast.error('Please enter your email address');
			return;
		}

		loading = true;

		try {
			const { error } = await supabase.auth.signInWithOtp({
				email,
				options: {
					emailRedirectTo: `${window.location.origin}/auth/callback`
				}
			});

			if (error) throw error;

			isMagicLinkSent = true;
			toast.success('Magic link sent to your email');
		} catch (error: any) {
			toast.error(error.message || 'Failed to send magic link');
		} finally {
			loading = false;
		}
	}

	async function handleOAuthSignIn(provider: 'google' | 'github') {
		loading = true;

		try {
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: `${window.location.origin}/auth/callback`
				}
			});

			if (error) throw error;
		} catch (error: any) {
			toast.error(error.message || 'OAuth sign in failed');
			loading = false;
		}
	}

	function togglePassword() {
		showPassword = !showPassword;
	}

	async function handleTwoFactorVerify(event: CustomEvent) {
		const { code, recoveryCode } = event.detail;

		try {
			let response;

			if (recoveryCode) {
				// Handle recovery code verification
				response = await fetch('/api/v1/auth/2fa/recovery', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: pendingUserEmail,
						recoveryCode: recoveryCode
					})
				});
			} else {
				// Handle 2FA code verification
				response = await fetch('/api/v1/auth/verify-2fa', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: pendingUserEmail,
						code: code
					})
				});
			}

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Verification failed');
			}

			// Verification successful, now sign in with stored credentials
			const { data, error } = await supabase.auth.signInWithPassword({
				email: pendingUserEmail,
				password: pendingPassword
			});

			if (error) throw error;

			if (data.session) {
				toast.success('Signed in successfully');

				// Clear pending credentials
				pendingUserEmail = '';
				pendingPassword = '';
				showTwoFactorVerification = false;
				isInTwoFactorFlow.set(false);

				// Resubscribe to userStore
				resubscribeToUserStore();

				// Redirect to intended destination
				const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
				console.log('🔄 [SIGNIN] REDIRECTING: 2FA verified, going to', redirectTo);
				goto(redirectTo, { replaceState: true });

				// Auth store is automatically updated by onAuthStateChange, no need to manually update
			}
		} catch (error: any) {
			console.error('2FA verification error:', error);
			toast.error(error.message || 'Verification failed');
		}
	}

	function handleTwoFactorBack() {
		showTwoFactorVerification = false;
		pendingUserEmail = '';
		pendingPassword = '';
		isInTwoFactorFlow.set(false);

		// Resubscribe to userStore
		resubscribeToUserStore();
	}

	function handleTwoFactorCancel() {
		showTwoFactorVerification = false;
		pendingUserEmail = '';
		pendingPassword = '';
		isInTwoFactorFlow.set(false);

		// Resubscribe to userStore
		resubscribeToUserStore();
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
	<div class="w-full max-w-md">
		<!-- Back to home -->
		<div class="mb-8">
			<a
				href="/"
				class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
			>
				<ArrowLeft class="h-4 w-4 mr-2" />
				Back to home
			</a>
		</div>

		<!-- Sign In Form -->
		<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
			<div class="text-center mb-8">
				<div class="mx-auto w-12 h-12 bg-[rgb(37,140,244)] rounded-full flex items-center justify-center mb-4">
					<LogIn class="h-6 w-6 text-white" />
				</div>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
					Sign in to your account
				</h1>
				<p class="text-gray-600 dark:text-gray-400">
					Welcome back! Please enter your details to access your account.
				</p>
			</div>

			{#if isMagicLinkSent}
				<div class="text-center">
					<div class="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
						<p class="text-green-800 dark:text-green-200 text-sm">
							Check your email for a magic link to sign in.
						</p>
					</div>
					<button
						onclick={() => isMagicLinkSent = false}
						class="text-sm text-[rgb(37,140,244)] hover:text-[rgb(37,140,244)]/80 transition-colors cursor-pointer"
					>
						Try a different method
					</button>
				</div>
			{:else}
				<form onsubmit={handleSignIn} class="space-y-6">
					<!-- Email Field -->
					<div>
						<label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Email address
						</label>
						<div class="relative">
							<Mail class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
							<input
								id="email"
								type="email"
								bind:value={email}
								required
								class="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent transition-colors"
								placeholder="Enter your email"
							/>
						</div>
					</div>

					<!-- Password Field -->
					<div>
						<label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Password
						</label>
						<div class="relative">
							<Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
							<input
								id="password"
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								required
								class="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent transition-colors"
								placeholder="Enter your password"
							/>
							<button
								type="button"
								onclick={togglePassword}
								class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
							>
								{#if showPassword}
									<EyeOff class="h-5 w-5" />
								{:else}
									<Eye class="h-5 w-5" />
								{/if}
							</button>
						</div>
					</div>

					<!-- Forgot Password Link -->
					<div class="flex items-center justify-end">
						<button
							type="button"
							onclick={handleMagicLink}
							disabled={loading || !email}
							class="text-sm text-[rgb(37,140,244)] hover:text-[rgb(37,140,244)]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
						>
							Forgot your password?
						</button>
					</div>

					<!-- Sign In Button -->
					<button
						type="submit"
						disabled={loading}
						class="w-full bg-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors cursor-pointer"
					>
						{loading ? 'Signing in...' : 'Sign in'}
					</button>
				</form>

				<div class="text-center mt-6">
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Don't have an account?
						<a href="/auth/signup" class="font-medium text-[rgb(37,140,244)] hover:text-[rgb(37,140,244)]/80 transition-colors cursor-pointer">
							Sign up
						</a>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Two-Factor Authentication Modal -->
<TwoFactorVerification
	open={showTwoFactorVerification}
	userEmail={pendingUserEmail}
	on:verify={handleTwoFactorVerify}
	on:back={handleTwoFactorBack}
	on:cancel={handleTwoFactorCancel}
/>