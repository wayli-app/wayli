<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { userStore } from '$lib/stores/auth';
	import {
		Mail,
		Lock,
		Eye,
		EyeOff,
		Github,
		Chrome,
		ArrowLeft,
		User,
		Check,
		X
	} from 'lucide-svelte';
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
			const {
				data: { user }
			} = await supabase.auth.getUser();
			console.log('🔐 [SIGNUP] User check:', user ? `Found - ${user.email}` : 'None');

			if (user) {
				// User is already authenticated, redirect to intended destination or default
				const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
				console.log('🔄 [SIGNUP] REDIRECTING: User already authenticated, going to', redirectTo);
				goto(redirectTo);
				return;
			}
		})();

		// Subscribe to auth changes for future registrations
		const unsubscribe = userStore.subscribe((user) => {
			console.log('🔐 [SIGNUP] User store updated:', user ? `User: ${user.email}` : 'No user');
			if (user) {
				const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
				console.log('🔄 [SIGNUP] REDIRECTING: User authenticated, going to', redirectTo);
				goto(redirectTo);
			}
		});

		return unsubscribe;
	});

	async function handleSignUp(event: Event) {
		event.preventDefault();

		// Validate required fields
		if (!firstName.trim()) {
			toast.error('First name is required');
			return;
		}

		if (!lastName.trim()) {
			toast.error('Last name is required');
			return;
		}

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
						first_name: firstName.trim(),
						last_name: lastName.trim(),
						full_name: `${firstName.trim()} ${lastName.trim()}`.trim()
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

		<!-- Sign Up Form -->
		<div
			class="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mb-8 text-center">
				<h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
					Create your account
				</h1>
				<p class="text-gray-600 dark:text-gray-400">Join Wayli and start your journey</p>
			</div>

			{#if isEmailSent}
				<div class="text-center">
					<div
						class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20"
					>
						<p class="text-sm text-green-800 dark:text-green-200">
							Check your email for a confirmation link to complete your registration.
						</p>
					</div>
					<button
						onclick={() => (isEmailSent = false)}
						class="cursor-pointer text-sm text-[rgb(37,140,244)] transition-colors hover:text-[rgb(37,140,244)]/80"
					>
						Try a different method
					</button>
				</div>
			{:else}
				<form onsubmit={handleSignUp} class="space-y-6">
					<!-- Name Fields -->
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label
								for="firstName"
								class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								First name
							</label>
							<div class="relative">
								<User
									class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400"
								/>
								<input
									id="firstName"
									type="text"
									bind:value={firstName}
									required
									class="w-full rounded-lg border border-gray-300 bg-white py-3 pr-4 pl-10 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
									placeholder="First name"
								/>
							</div>
						</div>
						<div>
							<label
								for="lastName"
								class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								Last name
							</label>
							<input
								id="lastName"
								type="text"
								bind:value={lastName}
								required
								class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
								placeholder="Last name"
							/>
						</div>
					</div>

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
								placeholder="Create a password"
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

						<!-- Password Requirements -->
						{#if password.length > 0}
							<div class="mt-3 space-y-2">
								<p class="text-xs font-medium text-gray-700 dark:text-gray-300">
									Password requirements:
								</p>
								<div class="space-y-1">
									<div class="flex items-center text-xs">
										{#if passwordValidation.minLength}
											<Check class="mr-2 h-3 w-3 text-green-500" />
										{:else}
											<X class="mr-2 h-3 w-3 text-red-500" />
										{/if}
										<span
											class={passwordValidation.minLength
												? 'text-green-600 dark:text-green-400'
												: 'text-red-600 dark:text-red-400'}
										>
											At least 8 characters
										</span>
									</div>
									<div class="flex items-center text-xs">
										{#if passwordValidation.hasUppercase}
											<Check class="mr-2 h-3 w-3 text-green-500" />
										{:else}
											<X class="mr-2 h-3 w-3 text-red-500" />
										{/if}
										<span
											class={passwordValidation.hasUppercase
												? 'text-green-600 dark:text-green-400'
												: 'text-red-600 dark:text-red-400'}
										>
											One uppercase letter
										</span>
									</div>
									<div class="flex items-center text-xs">
										{#if passwordValidation.hasLowercase}
											<Check class="mr-2 h-3 w-3 text-green-500" />
										{:else}
											<X class="mr-2 h-3 w-3 text-red-500" />
										{/if}
										<span
											class={passwordValidation.hasLowercase
												? 'text-green-600 dark:text-green-400'
												: 'text-red-600 dark:text-red-400'}
										>
											One lowercase letter
										</span>
									</div>
									<div class="flex items-center text-xs">
										{#if passwordValidation.hasNumber}
											<Check class="mr-2 h-3 w-3 text-green-500" />
										{:else}
											<X class="mr-2 h-3 w-3 text-red-500" />
										{/if}
										<span
											class={passwordValidation.hasNumber
												? 'text-green-600 dark:text-green-400'
												: 'text-red-600 dark:text-red-400'}
										>
											One number
										</span>
									</div>
									<div class="flex items-center text-xs">
										{#if passwordValidation.hasSpecial}
											<Check class="mr-2 h-3 w-3 text-green-500" />
										{:else}
											<X class="mr-2 h-3 w-3 text-red-500" />
										{/if}
										<span
											class={passwordValidation.hasSpecial
												? 'text-green-600 dark:text-green-400'
												: 'text-red-600 dark:text-red-400'}
										>
											One special character
										</span>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Confirm Password Field -->
					<div>
						<label
							for="confirmPassword"
							class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Confirm password
						</label>
						<div class="relative">
							<Lock
								class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400"
							/>
							<input
								id="confirmPassword"
								type={showConfirmPassword ? 'text' : 'password'}
								bind:value={confirmPassword}
								required
								class="w-full rounded-lg border border-gray-300 bg-white py-3 pr-12 pl-10 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 {!doPasswordsMatch &&
								confirmPassword.length > 0
									? 'border-red-500'
									: ''}"
								placeholder="Confirm your password"
							/>
							<button
								type="button"
								onclick={toggleConfirmPassword}
								class="absolute top-1/2 right-3 -translate-y-1/2 transform cursor-pointer text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
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
						class="w-full cursor-pointer rounded-lg bg-[rgb(37,140,244)] px-4 py-3 font-medium text-white transition-colors hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loading ? 'Creating account...' : 'Create account'}
					</button>
				</form>

				<div class="mt-6 text-center">
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Already have an account?
						<a
							href="/auth/signin"
							class="cursor-pointer font-medium text-[rgb(37,140,244)] transition-colors hover:text-[rgb(37,140,244)]/80"
						>
							Sign in
						</a>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
