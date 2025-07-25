<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { onMount, onDestroy } from 'svelte';
	import { userStore, isInTwoFactorFlow } from '$lib/stores/auth';
	import { Mail, Lock, Eye, EyeOff, Github, Chrome, ArrowLeft, LogIn } from 'lucide-svelte';
	import { page } from '$app/stores';

	import { get } from 'svelte/store';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { EdgeFunctionsApiService } from '$lib/services/api/edge-functions-api.service';

	let email = '';
	let password = '';
	let loading = false;
	let showPassword = false;
	let isMagicLinkSent = false;

	let unsubscribeFromUserStore: (() => void) | null = null;

	onMount(() => {
		// Subscribe to user store for authentication state changes
		unsubscribeFromUserStore = userStore.subscribe((user) => {
			if (user && $page.url.pathname === '/auth/signin') {
				// Don't automatically redirect - let the login flow handle it
				// This prevents the brief flash of the dashboard
			}
		});
	});

	onDestroy(() => {
		if (unsubscribeFromUserStore) {
			unsubscribeFromUserStore();
			unsubscribeFromUserStore = null;
		}
	});

	function resubscribeToUserStore() {
		// Only subscribe if we're on the signin page
		if ($page.url.pathname.startsWith('/auth/signin')) {
			unsubscribeFromUserStore = userStore.subscribe((user) => {
				// Get current 2FA flow state
				let currentTwoFactorState = false;
				isInTwoFactorFlow.subscribe((state) => {
					currentTwoFactorState = state;
				})();

				if (user && !currentTwoFactorState) {
					// Only redirect if we're on the signin page and not in 2FA flow
					if ($page.url.pathname.startsWith('/auth/signin')) {
						const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
						goto(redirectTo);
					}
				}
			});
		}
	}

	async function handleSignIn(event: Event) {
		event.preventDefault();
		loading = true;

		try {
			// First, authenticate with Supabase to get a temporary session
				const { data, error } = await supabase.auth.signInWithPassword({
					email,
					password
				});

				if (error) throw error;

				if (data.session) {
				// Authentication successful, now check if user has 2FA enabled
				try {
					const edgeService = new EdgeFunctionsApiService();
					const checkResult = await edgeService.check2FA(data.session) as any;
					const has2FA = checkResult?.enabled === true;

															if (has2FA) {
						// User has 2FA enabled - sign out immediately to prevent access
						await supabase.auth.signOut();

						// Redirect to 2FA verification page with credentials
						const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
						const verificationUrl = `/auth/2fa-verify?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&redirectTo=${encodeURIComponent(redirectTo)}`;

						goto(verificationUrl);
					} else {
						// No 2FA enabled, proceed with normal login
					toast.success('Signed in successfully');
					// The auth state change will handle the redirect automatically

					// Fallback: If auth state change doesn't redirect within 1 second, redirect manually
					setTimeout(() => {
						const currentUser = get(userStore);
						if (currentUser && $page.url.pathname.startsWith('/auth/signin')) {
							const redirectTo =
								$page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
							goto(redirectTo, { replaceState: true });
						}
					}, 1000);
					}
				} catch (twoFactorError: any) {
					console.error('2FA check error:', twoFactorError);
					// If 2FA check fails, sign out and show error
					await supabase.auth.signOut();
					toast.error('Failed to verify 2FA status. Please try again.');
				}
				} else {
					toast.error('No session returned from authentication');
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


</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
	<div class="w-full max-w-md">
		<!-- Back to home -->
		<div class="mb-8">
			<a
				href="/"
				class="inline-flex items-center text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
			>
				<ArrowLeft class="mr-2 h-4 w-4" />
				Back to home
			</a>
		</div>

		<!-- Sign In Form -->
		<div
			class="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mb-8 text-center">
				<div
					class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(37,140,244)]"
				>
					<LogIn class="h-6 w-6 text-white" />
				</div>
				<h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
					Sign in to your account
				</h1>
				<p class="text-gray-600 dark:text-gray-400">
					Welcome back! Please enter your details to access your account.
				</p>
			</div>

			{#if isMagicLinkSent}
				<div class="text-center">
					<div
						class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20"
					>
						<p class="text-sm text-green-800 dark:text-green-200">
							Check your email for a magic link to sign in.
						</p>
					</div>
					<button
						onclick={() => (isMagicLinkSent = false)}
						class="cursor-pointer text-sm text-[rgb(37,140,244)] transition-colors hover:text-[rgb(37,140,244)]/80"
					>
						Try a different method
					</button>
				</div>
			{:else}
				<form onsubmit={handleSignIn} class="space-y-6">
					<!-- Email Field -->
					<div>
						<label
							for="email"
							class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Email address
						</label>
						<div class="relative">
							<Mail
								class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400"
							/>
							<input
								id="email"
								type="email"
								bind:value={email}
								required
								class="w-full rounded-lg border border-gray-300 bg-white py-3 pr-4 pl-10 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
								placeholder="Enter your email"
							/>
						</div>
					</div>

					<!-- Password Field -->
					<div>
						<label
							for="password"
							class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Password
						</label>
						<div class="relative">
							<Lock
								class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400"
							/>
							<input
								id="password"
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								required
								class="w-full rounded-lg border border-gray-300 bg-white py-3 pr-12 pl-10 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
								placeholder="Enter your password"
							/>
							<button
								type="button"
								onclick={togglePassword}
								class="absolute top-1/2 right-3 -translate-y-1/2 transform cursor-pointer text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
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
							class="cursor-pointer text-sm text-[rgb(37,140,244)] transition-colors hover:text-[rgb(37,140,244)]/80 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Forgot your password?
						</button>
					</div>

					<!-- Sign In Button -->
					<button
						type="submit"
						disabled={loading}
						class="w-full cursor-pointer rounded-lg bg-[rgb(37,140,244)] px-4 py-3 font-medium text-white transition-colors hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loading ? 'Signing in...' : 'Sign in'}
					</button>
				</form>

				<div class="mt-6 text-center">
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Don't have an account?
						<a
							href="/auth/signup"
							class="cursor-pointer font-medium text-[rgb(37,140,244)] transition-colors hover:text-[rgb(37,140,244)]/80"
						>
							Sign up
						</a>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>


