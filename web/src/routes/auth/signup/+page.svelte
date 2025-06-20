<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { userStore } from '$lib/stores/auth';
	import { Mail, Lock, Eye, EyeOff, Github, Chrome, ArrowLeft, User, Check, X } from 'lucide-svelte';
	import { page } from '$app/stores';

	let email = '';
	let password = '';
	let confirmPassword = '';
	let firstName = '';
	let lastName = '';
	let loading = false;
	let showPassword = false;
	let showConfirmPassword = false;
	let isEmailSent = false;

	// Password validation
	let passwordValidation = {
		minLength: false,
		hasUppercase: false,
		hasLowercase: false,
		hasNumber: false,
		hasSpecial: false
	};

	$: passwordValidation = {
		minLength: password.length >= 8,
		hasUppercase: /[A-Z]/.test(password),
		hasLowercase: /[a-z]/.test(password),
		hasNumber: /\d/.test(password),
		hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password)
	};

	$: isPasswordValid = Object.values(passwordValidation).every(Boolean);
	$: doPasswordsMatch = password === confirmPassword && password.length > 0;

	onMount(() => {
		console.log('🔐 [SIGNUP] Page mounted');
		// Check if user is already authenticated
		(async () => {
			const { data: { session } } = await supabase.auth.getSession();
			console.log('🔐 [SIGNUP] Session check:', session ? `Found - ${session.user.email}` : 'None');

			if (session?.user) {
				// User is already authenticated, redirect to intended destination or default
				const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/trips';
				console.log('🔄 [SIGNUP] REDIRECTING: User already authenticated, going to', redirectTo);
				goto(redirectTo);
				return;
			}
		})();

		// Subscribe to auth changes for future registrations
		const unsubscribe = userStore.subscribe(user => {
			console.log('🔐 [SIGNUP] User store updated:', user ? `User: ${user.email}` : 'No user');
			if (user) {
				const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/trips';
				console.log('🔄 [SIGNUP] REDIRECTING: User authenticated, going to', redirectTo);
				goto(redirectTo);
			}
		});

		return unsubscribe;
	});

	async function handleSignUp(event: Event) {
		event.preventDefault();

		if (!isPasswordValid) {
			toast.error('Please ensure your password meets all requirements');
			return;
		}

		if (!doPasswordsMatch) {
			toast.error('Passwords do not match');
			return;
		}

		loading = true;

		try {
			const { error } = await supabase.auth.signUp({
				email,
				password,
				options: {
					data: {
						first_name: firstName,
						last_name: lastName,
						full_name: `${firstName} ${lastName}`.trim()
					},
					emailRedirectTo: `${window.location.origin}/auth/callback`
				}
			});

			if (error) throw error;

			isEmailSent = true;
			toast.success('Check your email for confirmation link');
		} catch (error: any) {
			toast.error(error.message || 'Sign up failed');
		} finally {
			loading = false;
		}
	}

	async function handleOAuthSignUp(provider: 'google' | 'github') {
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
			toast.error(error.message || 'OAuth sign up failed');
			loading = false;
		}
	}

	function togglePassword() {
		showPassword = !showPassword;
	}

	function toggleConfirmPassword() {
		showConfirmPassword = !showConfirmPassword;
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

		<!-- Sign Up Form -->
		<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
			<div class="text-center mb-8">
				<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
					Create your account
				</h1>
				<p class="text-gray-600 dark:text-gray-400">
					Join Wayli and start your journey
				</p>
			</div>

			{#if isEmailSent}
				<div class="text-center">
					<div class="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
						<p class="text-green-800 dark:text-green-200 text-sm">
							Check your email for a confirmation link to complete your registration.
						</p>
					</div>
					<button
						onclick={() => isEmailSent = false}
						class="text-sm text-[rgb(37,140,244)] hover:text-[rgb(37,140,244)]/80 transition-colors cursor-pointer"
					>
						Try a different method
					</button>
				</div>
			{:else}
				<form onsubmit={handleSignUp} class="space-y-6">
					<!-- Name Fields -->
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="firstName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								First name
							</label>
							<div class="relative">
								<User class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
								<input
									id="firstName"
									type="text"
									bind:value={firstName}
									class="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent transition-colors"
									placeholder="First name"
								/>
							</div>
						</div>
						<div>
							<label for="lastName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Last name
							</label>
							<input
								id="lastName"
								type="text"
								bind:value={lastName}
								class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent transition-colors"
								placeholder="Last name"
							/>
						</div>
					</div>

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
								placeholder="Create a password"
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

						<!-- Password Requirements -->
						{#if password.length > 0}
							<div class="mt-3 space-y-2">
								<p class="text-xs font-medium text-gray-700 dark:text-gray-300">Password requirements:</p>
								<div class="space-y-1">
									<div class="flex items-center text-xs">
										{#if passwordValidation.minLength}
											<Check class="h-3 w-3 text-green-500 mr-2" />
										{:else}
											<X class="h-3 w-3 text-red-500 mr-2" />
										{/if}
										<span class="{passwordValidation.minLength ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
											At least 8 characters
										</span>
									</div>
									<div class="flex items-center text-xs">
										{#if passwordValidation.hasUppercase}
											<Check class="h-3 w-3 text-green-500 mr-2" />
										{:else}
											<X class="h-3 w-3 text-red-500 mr-2" />
										{/if}
										<span class="{passwordValidation.hasUppercase ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
											One uppercase letter
										</span>
									</div>
									<div class="flex items-center text-xs">
										{#if passwordValidation.hasLowercase}
											<Check class="h-3 w-3 text-green-500 mr-2" />
										{:else}
											<X class="h-3 w-3 text-red-500 mr-2" />
										{/if}
										<span class="{passwordValidation.hasLowercase ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
											One lowercase letter
										</span>
									</div>
									<div class="flex items-center text-xs">
										{#if passwordValidation.hasNumber}
											<Check class="h-3 w-3 text-green-500 mr-2" />
										{:else}
											<X class="h-3 w-3 text-red-500 mr-2" />
										{/if}
										<span class="{passwordValidation.hasNumber ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
											One number
										</span>
									</div>
									<div class="flex items-center text-xs">
										{#if passwordValidation.hasSpecial}
											<Check class="h-3 w-3 text-green-500 mr-2" />
										{:else}
											<X class="h-3 w-3 text-red-500 mr-2" />
										{/if}
										<span class="{passwordValidation.hasSpecial ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
											One special character
										</span>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Confirm Password Field -->
					<div>
						<label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Confirm password
						</label>
						<div class="relative">
							<Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
							<input
								id="confirmPassword"
								type={showConfirmPassword ? 'text' : 'password'}
								bind:value={confirmPassword}
								required
								class="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent transition-colors {!doPasswordsMatch && confirmPassword.length > 0 ? 'border-red-500' : ''}"
								placeholder="Confirm your password"
							/>
							<button
								type="button"
								onclick={toggleConfirmPassword}
								class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
							>
								{#if showConfirmPassword}
									<EyeOff class="h-5 w-5" />
								{:else}
									<Eye class="h-5 w-5" />
								{/if}
							</button>
						</div>
						{#if !doPasswordsMatch && confirmPassword.length > 0}
							<p class="mt-1 text-xs text-red-600 dark:text-red-400">Passwords do not match</p>
						{/if}
					</div>

					<!-- Sign Up Button -->
					<button
						type="submit"
						disabled={loading || !isPasswordValid || !doPasswordsMatch}
						class="w-full bg-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors cursor-pointer"
					>
						{loading ? 'Creating account...' : 'Create account'}
					</button>
				</form>

				<div class="text-center mt-6">
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Already have an account?
						<a href="/auth/signin" class="font-medium text-[rgb(37,140,244)] hover:text-[rgb(37,140,244)]/80 transition-colors cursor-pointer">
							Sign in
						</a>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>