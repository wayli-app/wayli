<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { userStore } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';
	import { Mail, Lock, ArrowRight } from 'lucide-svelte';
	import { page } from '$app/stores';

	onMount(() => {
		console.log('🔐 [AUTH] Page mounted');
		// Check if user is already authenticated
		(async () => {
			const { data: { session } } = await supabase.auth.getSession();
			console.log('🔐 [AUTH] Session check:', session ? `Found - ${session.user.email}` : 'None');

			if (session?.user) {
				// User is already authenticated, redirect to intended destination or default
				const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/trips';
				console.log('🔄 [AUTH] REDIRECTING: User already authenticated, going to', redirectTo);
				goto(redirectTo);
				return;
			}
		})();

		// Subscribe to auth changes for future logins
		const unsubscribe = userStore.subscribe(user => {
			console.log('🔐 [AUTH] User store updated:', user ? `User: ${user.email}` : 'No user');
			if (user) {
				const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/trips';
				console.log('🔄 [AUTH] REDIRECTING: User authenticated, going to', redirectTo);
				goto(redirectTo);
			}
		});

		return unsubscribe;
	});
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
	<div class="w-full max-w-md">
		<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
			<div class="text-center mb-8">
				<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
					Welcome to Wayli
				</h1>
				<p class="text-gray-600 dark:text-gray-400">
					Choose how you'd like to get started
				</p>
			</div>

			<div class="space-y-4">
				<a
					href="/auth/signin"
					class="w-full flex items-center justify-center gap-3 bg-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/90 text-white font-medium py-3 px-4 rounded-lg transition-colors"
				>
					<Mail class="h-5 w-5" />
					Sign in with email
					<ArrowRight class="h-5 w-5" />
				</a>

				<a
					href="/auth/signup"
					class="w-full flex items-center justify-center gap-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 px-4 rounded-lg transition-colors"
				>
					<Lock class="h-5 w-5" />
					Create new account
					<ArrowRight class="h-5 w-5" />
				</a>
			</div>

			<div class="mt-8 text-center">
				<a
					href="/"
					class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
				>
					Back to home
				</a>
			</div>
		</div>
	</div>
</div>