<script lang="ts">
	import { Mail, ArrowLeft, RefreshCw } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { translate } from '$lib/i18n';
	import { fluxbase } from '$lib/fluxbase';

	import { goto } from '$app/navigation';

	// Use the reactive translation function
	let t = $derived($translate);

	let email = $state('');
	let resendLoading = $state(false);
	let resendCooldown = $state(0);
	let cooldownInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		// Get email from sessionStorage or Fluxbase session
		const pendingEmail = sessionStorage.getItem('pending_verification_email');

		(async () => {
			const { data } = await fluxbase.auth.getUser();
			const user = data?.user;

			if (user && user.email_verified) {
				// User is already verified, redirect to dashboard
				console.log('🔄 [VERIFY-EMAIL] User already verified, redirecting to dashboard');
				sessionStorage.removeItem('pending_verification_email');
				goto('/dashboard/statistics');
			} else if (user?.email) {
				// Get email from user object if available
				email = user.email;
			} else if (pendingEmail) {
				// Fall back to sessionStorage
				email = pendingEmail;
			}
		})();

		return () => {
			if (cooldownInterval) {
				clearInterval(cooldownInterval);
			}
		};
	});

	async function resendVerificationEmail() {
		if (!email) {
			toast.error(t('auth.emailRequired'));
			return;
		}

		if (resendCooldown > 0) {
			toast.error(t('auth.pleaseWaitBeforeResending'));
			return;
		}

		resendLoading = true;

		try {
			const { error } = await fluxbase.auth.resendOtp({
				type: 'signup',
				email: email,
				options: {
					emailRedirectTo: `${window.location.origin}/auth/callback`
				}
			});

			if (error) throw error;

			toast.success(t('auth.verificationEmailResent'));

			// Start cooldown (60 seconds)
			resendCooldown = 60;
			cooldownInterval = setInterval(() => {
				resendCooldown--;
				if (resendCooldown <= 0 && cooldownInterval) {
					clearInterval(cooldownInterval);
					cooldownInterval = null;
				}
			}, 1000);
		} catch (error: any) {
			console.error('Error resending verification email:', error);
			toast.error(error.message || t('auth.failedToResendEmail'));
		} finally {
			resendLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{t('auth.verifyYourEmail')} · Wayli</title>
</svelte:head>

<div class="bg-background flex min-h-screen items-center justify-center px-4">
	<div class="w-full max-w-md">
		<!-- Back to signin -->
		<div class="mb-8">
			<a
				href="/auth/signin"
				class="hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground inline-flex items-center text-sm text-gray-600 transition-colors"
			>
				<ArrowLeft class="mr-2 h-4 w-4" />
				{t('auth.backToSignIn')}
			</a>
		</div>

		<!-- Verification Card -->
		<div class="bg-card border-border rounded-2xl border p-8 shadow-xl">
			<div class="mb-6 text-center">
				<!-- Email Icon -->
				<div
					class="bg-primary/10 dark:bg-primary/30 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
				>
					<Mail class="text-primary dark:text-muted-foreground h-8 w-8" />
				</div>

				<h1 class="text-foreground mb-2 text-2xl font-bold">
					{t('auth.verifyYourEmail')}
				</h1>
				<p class="text-muted-foreground">
					{t('auth.verificationEmailSent')}
				</p>
			</div>

			<!-- Email Address -->
			{#if email}
				<div class="dark:bg-muted/50 mb-6 rounded-lg bg-gray-50 p-4">
					<p class="text-foreground text-center text-sm font-medium">
						{email}
					</p>
				</div>
			{/if}

			<!-- Instructions -->
			<div class="mb-6 space-y-3">
				<div class="text-muted-foreground flex items-start gap-3 text-sm">
					<div
						class="bg-primary/10 text-primary dark:bg-primary/30 dark:text-muted-foreground mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
					>
						1
					</div>
					<p>{t('auth.checkInboxForEmail')}</p>
				</div>
				<div class="text-muted-foreground flex items-start gap-3 text-sm">
					<div
						class="bg-primary/10 text-primary dark:bg-primary/30 dark:text-muted-foreground mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
					>
						2
					</div>
					<p>{t('auth.clickVerificationLink')}</p>
				</div>
				<div class="text-muted-foreground flex items-start gap-3 text-sm">
					<div
						class="bg-primary/10 text-primary dark:bg-primary/30 dark:text-muted-foreground mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
					>
						3
					</div>
					<p>{t('auth.youWillBeRedirected')}</p>
				</div>
			</div>

			<!-- Resend Button -->
			<div class="mb-6">
				<button
					type="button"
					onclick={resendVerificationEmail}
					disabled={resendLoading || resendCooldown > 0}
					class="hover:bg-muted dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-900 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if resendLoading}
						<span class="flex items-center justify-center gap-2">
							<RefreshCw class="h-4 w-4 animate-spin" />
							{t('auth.resending')}
						</span>
					{:else if resendCooldown > 0}
						{t('auth.resendIn', { seconds: resendCooldown })}
					{:else}
						{t('auth.resendVerificationEmail')}
					{/if}
				</button>
			</div>

			<!-- Help Text -->
			<div class="dark:bg-muted/50 rounded-lg bg-gray-50 p-4">
				<p class="text-muted-foreground text-center text-sm">
					{t('auth.didntReceiveEmail')}
					<br />
					<span class="text-xs">{t('auth.checkSpamFolder')}</span>
				</p>
			</div>
		</div>

		<!-- Additional Help -->
		<div class="mt-6 text-center">
			<p class="text-muted-foreground text-sm">
				{t('auth.needHelp')}
				<a
					href="mailto:support@wayli.app"
					class="text-primary hover:text-primary/80 cursor-pointer font-medium transition-colors"
				>
					{t('auth.contactSupport')}
				</a>
			</p>
		</div>
	</div>
</div>
