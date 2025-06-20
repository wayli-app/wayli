<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { userStore, sessionStore } from '$lib/stores/auth';

	let configStatus = 'Checking...';
	let sessionStatus = 'Checking...';
	let userStatus = 'Checking...';

	onMount(() => {
		// Test Supabase configuration
		(async () => {
			try {
				const { data, error } = await supabase.auth.getSession();

				if (error) {
					configStatus = `Error: ${error.message}`;
				} else {
					configStatus = 'Supabase configured correctly';
				}

				sessionStatus = data.session ? 'Session found' : 'No session';
			} catch (error: any) {
				configStatus = `Error: ${error.message}`;
			}
		})();

		// Subscribe to user store
		const unsubscribe = userStore.subscribe(user => {
			userStatus = user ? `User: ${user.email}` : 'No user';
		});

		return unsubscribe;
	});
</script>

<div class="p-8">
	<h1 class="text-2xl font-bold mb-4">Supabase Test</h1>

	<div class="space-y-4">
		<div>
			<strong>Configuration:</strong> {configStatus}
		</div>
		<div>
			<strong>Session:</strong> {sessionStatus}
		</div>
		<div>
			<strong>User Store:</strong> {userStatus}
		</div>
	</div>

	<div class="mt-8">
		<a href="/" class="text-blue-600 hover:underline cursor-pointer">Back to home</a>
	</div>
</div>