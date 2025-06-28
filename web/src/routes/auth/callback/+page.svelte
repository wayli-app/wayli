<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Loader2 } from 'lucide-svelte';
	import { page } from '$app/stores';

	let loading = true;
	let error = '';

	onMount(async () => {
		console.log('🔄 [CALLBACK] Page mounted');
		try {
			// Handle OAuth callback - use getUser() for security
			const { data: userData, error: userError } = await supabase.auth.getUser();
			console.log('🔄 [CALLBACK] User check:', userData.user ? `Found - ${userData.user.email}` : 'None');

			if (userError) {
				console.log('❌ [CALLBACK] ERROR: User error:', userError);
				throw userError;
			}

			if (userData.user) {
				const redirectTo = $page.url.searchParams.get('redirectTo') || '/dashboard/statistics';
				console.log('🔄 [CALLBACK] REDIRECTING: User found, going to', redirectTo);
				toast.success('Authentication successful');
				goto(redirectTo);
			} else {
				console.log('❌ [CALLBACK] ERROR: No user found');
				error = 'No user found';
				toast.error('Authentication failed');
			}
		} catch (err: any) {
			console.log('❌ [CALLBACK] ERROR: Exception:', err.message);
			error = err.message || 'Authentication failed';
			toast.error('Authentication failed');
		} finally {
			loading = false;
		}
	});
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	<div class="text-center">
		{#if loading}
			<Loader2 class="h-8 w-8 animate-spin text-[rgb(37,140,244)] mx-auto mb-4" />
			<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
				Completing authentication...
			</h2>
			<p class="text-gray-600 dark:text-gray-400">
				Please wait while we complete your sign in.
			</p>
		{:else if error}
			<div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md">
				<h2 class="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">
					Authentication failed
				</h2>
				<p class="text-red-700 dark:text-red-300 mb-4">
					{error}
				</p>
				<a
					href="/auth/signin"
					class="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
				>
					Try again
				</a>
			</div>
		{/if}
	</div>
</div>