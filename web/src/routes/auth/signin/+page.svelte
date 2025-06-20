<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { userStore } from '$lib/stores/auth';
	import { Mail, Lock, Eye, EyeOff, Github, Chrome, ArrowLeft, LogIn } from 'lucide-svelte';
	import { page } from '$app/stores';

	let email = '';
	let password = '';
	let loading = false;
	let showPassword = false;
	let isMagicLinkSent = false;

	onMount(() => {
		console.log('🔐 [SIGNIN] Page mounted');
		// Check if user is already authenticated
		(async () => {
			const { data: { session } } = await supabase.auth.getSession();
			console.log('🔐 [SIGNIN] Session check:', session ? `Found - ${session.user.email}` : 'None');

			if (session?.user) {
				// Only redirect if we're on the signin page
				if ($page.url.pathname.startsWith('/auth/signin')) {
					// User is already authenticated, redirect to intended destination or default
					const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/trips';
					console.log('🔄 [SIGNIN] REDIRECTING: User already authenticated, going to', redirectTo);
					goto(redirectTo);
					return;
				}
			}
		})();

		// Subscribe to auth changes for future logins
		const unsubscribe = userStore.subscribe(user => {
			console.log('🔐 [SIGNIN] User store updated:', user ? `User: ${user.email}` : 'No user');
			if (user) {
				// Only redirect if we're on the signin page
				if ($page.url.pathname.startsWith('/auth/signin')) {
					const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/trips';
					console.log('🔄 [SIGNIN] REDIRECTING: User authenticated, going to', redirectTo);
					goto(redirectTo);
				}
			}
		});

		return unsubscribe;
	});

	async function handleSignIn(event: Event) {
		event.preventDefault();
		loading = true;

		try {
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password
			});

			if (error) throw error;

			if (data.session) {
				toast.success('Signed in successfully');

				// Force a small delay to ensure auth state is updated
				await new Promise(resolve => setTimeout(resolve, 500));

				// Double-check the session and redirect
				const { data: { session: currentSession } } = await supabase.auth.getSession();
				if (currentSession) {
					const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/trips';
					console.log('🔄 [SIGNIN] REDIRECTING: Login successful, going to', redirectTo);
					goto(redirectTo, { replaceState: true });
				} else {
					console.log('❌ [SIGNIN] ERROR: Session not found after authentication');
					toast.error('Session not found after authentication');
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