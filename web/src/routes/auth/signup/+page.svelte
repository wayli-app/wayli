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
	import { translate } from '$lib/i18n';

	// Use the reactive translation function
	let t = $derived($translate);

	let email = '';
	let password = '';
	let confirmPassword = '';
	let firstName = '';
	let lastName = '';
	let loading = false;
	let showPassword = false;
	let showConfirmPassword = false;
	let isEmailSent = false;
	let registrationDisabled = false;
	let isLoadingSettings = false;

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

	async function checkServerSettings() {
		isLoadingSettings = true;
		try {
			const response = await fetch('/api/server-settings');
			if (response.ok) {
				const result = await response.json();
				if (result.success && result.data) {
					registrationDisabled = !result.data.allow_registration;
					console.log('🔧 [SIGNUP] Server settings:', { allow_registration: result.data.allow_registration });
				} else {
					console.error('Failed to fetch server settings:', result.error);
					// Default to allowing registration if we can't fetch settings
					registrationDisabled = false;
				}
			} else {
				console.error('Failed to fetch server settings');
				// Default to allowing registration if we can't fetch settings
				registrationDisabled = false;
			}
		} catch (error) {
			console.error('Error fetching server settings:', error);
			// Default to allowing registration if we can't fetch settings
			registrationDisabled = false;
		} finally {
			isLoadingSettings = false;
		}
	}

	onMount(() => {
		console.log('🔐 [SIGNUP] Page mounted');

		// Check server settings first
		checkServerSettings();

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

		// Check if registration is disabled
		if (registrationDisabled) {
			toast.error(t('auth.userRegistrationDisabled'));
			return;
		}

		// Validate required fields
		if (!firstName.trim()) {
			toast.error(t('auth.firstNameRequired'));
			return;
		}

		if (!lastName.trim()) {
			toast.error(t('auth.lastNameRequired'));
			return;
		}

		if (!isPasswordValid) {
			toast.error(t('auth.passwordRequirementsNotMet'));
			return;
		}

		if (!doPasswordsMatch) {
			toast.error(t('auth.passwordsDoNotMatch'));
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
			toast.success(t('auth.checkEmailConfirmationLink'));
		} catch (error: any) {
			toast.error(error.message || t('auth.signUpFailed'));
		} finally {
			loading = false;
		}
	}

	async function handleOAuthSignUp(provider: 'google' | 'github') {
		// Check if registration is disabled
		if (registrationDisabled) {
			toast.error(t('auth.userRegistrationDisabled'));
			return;
		}

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
			toast.error(error.message || t('auth.oauthSignUpFailed'));
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
				{t('auth.backToHome')}
			</a>
		</div>

		<!-- Sign Up Form -->
		<div
			class="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mb-8 text-center">
				<h1 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
					{t('auth.createYourAccount')}
				</h1>
				<p class="text-gray-600 dark:text-gray-400">{t('auth.joinWayli')}</p>
			</div>

			{#if isLoadingSettings}
				<div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
					<div class="flex items-center">
						<div class="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
						<div>
							<h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">
								{t('auth.loadingSettings')}
							</h3>
							<p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
								{t('auth.checkingRegistrationStatus')}
							</p>
						</div>
					</div>
				</div>
			{:else if registrationDisabled}
				<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
					<div class="flex items-center">
						<X class="mr-2 h-5 w-5 text-red-500" />
						<div>
							<h3 class="text-sm font-medium text-red-800 dark:text-red-200">
								{t('auth.registrationDisabled')}
							</h3>
							<p class="mt-1 text-sm text-red-700 dark:text-red-300">
								{t('auth.registrationDisabledDescription')}
							</p>
						</div>
					</div>
				</div>
			{/if}

			{#if isEmailSent}
				<div class="text-center">
					<div
						class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20"
					>
						<p class="text-sm text-green-800 dark:text-green-200">
							{t('auth.checkEmailConfirmation')}
						</p>
					</div>
					<button
						onclick={() => (isEmailSent = false)}
						class="cursor-pointer text-sm text-[rgb(37,140,244)] transition-colors hover:text-[rgb(37,140,244)]/80"
					>
						{t('auth.tryDifferentMethod')}
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
								{t('auth.firstName')}
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
									disabled={registrationDisabled}
									class="w-full rounded-lg border border-gray-300 bg-white py-3 pr-4 pl-10 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
									placeholder={t('auth.firstName')}
								/>
							</div>
						</div>
						<div>
							<label
								for="lastName"
								class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t('auth.lastName')}
							</label>
							<input
								id="lastName"
								type="text"
								bind:value={lastName}
								required
								disabled={registrationDisabled}
								class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
								placeholder={t('auth.lastName')}
							/>
						</div>
					</div>

					<!-- Email Field -->
					<div>
						<label
							for="email"
							class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							{t('auth.emailAddress')}
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
								disabled={registrationDisabled}
								class="w-full rounded-lg border border-gray-300 bg-white py-3 pr-4 pl-10 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
								placeholder={t('auth.enterYourEmail')}
							/>
						</div>
					</div>

					<!-- Password Field -->
					<div>
						<label
							for="password"
							class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							{t('auth.password')}
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
								disabled={registrationDisabled}
								class="w-full rounded-lg border border-gray-300 bg-white py-3 pr-12 pl-10 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
								placeholder={t('auth.createPassword')}
							/>
							<button
								type="button"
								onclick={togglePassword}
								disabled={registrationDisabled}
								class="absolute top-1/2 right-3 -translate-y-1/2 transform cursor-pointer text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
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
									{t('auth.passwordRequirements')}
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
											{t('auth.atLeast8Characters')}
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
											{t('auth.oneUppercaseLetter')}
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
											{t('auth.oneLowercaseLetter')}
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
											{t('auth.oneNumber')}
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
											{t('auth.oneSpecialCharacter')}
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
							{t('auth.confirmPassword')}
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
								disabled={registrationDisabled}
								class="w-full rounded-lg border border-gray-300 bg-white py-3 pr-12 pl-10 text-gray-900 placeholder-gray-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-[rgb(37,140,244)] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-800 dark:disabled:text-gray-400 {!doPasswordsMatch &&
								confirmPassword.length > 0
									? 'border-red-500'
									: ''}"
								placeholder={t('auth.confirmYourPassword')}
							/>
							<button
								type="button"
								onclick={toggleConfirmPassword}
								disabled={registrationDisabled}
								class="absolute top-1/2 right-3 -translate-y-1/2 transform cursor-pointer text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{#if showConfirmPassword}
									<EyeOff class="h-5 w-5" />
								{:else}
									<Eye class="h-5 w-5" />
								{/if}
							</button>
						</div>
						{#if !doPasswordsMatch && confirmPassword.length > 0}
							<p class="mt-1 text-xs text-red-600 dark:text-red-400">{t('auth.passwordsDoNotMatch')}</p>
						{/if}
					</div>

					<!-- Sign Up Button -->
					<button
						type="submit"
						disabled={loading || !isPasswordValid || !doPasswordsMatch || registrationDisabled}
						class="w-full cursor-pointer rounded-lg bg-[rgb(37,140,244)] px-4 py-3 font-medium text-white transition-colors hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loading ? t('auth.creatingAccount') : registrationDisabled ? t('auth.registrationDisabled') : t('auth.createAccount')}
					</button>
				</form>

				<div class="mt-6 text-center">
					<p class="text-sm text-gray-600 dark:text-gray-400">
						{t('auth.alreadyHaveAccount')}
						<a
							href="/auth/signin"
							class="cursor-pointer font-medium text-[rgb(37,140,244)] transition-colors hover:text-[rgb(37,140,244)]/80"
						>
							{t('auth.signIn')}
						</a>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
