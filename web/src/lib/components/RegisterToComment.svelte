<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fluxbase } from '$lib/fluxbase';
	import { userStore } from '$lib/stores/auth';
	import { Loader2, MessageCircle } from 'lucide-svelte';

	type Props = {
		tripId: string;
	};

	let { tripId }: Props = $props();

	let email = $state('');
	let password = $state('');
	let fullName = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	const username = $derived(page.params.username ?? '');
	const currentPath = $derived(`/u/${username}/trips/${tripId}`);

	async function handleRegister() {
		if (!email.trim() || !password.trim()) return;
		isLoading = true;
		error = null;
		try {
			const { data, error: signUpError } = await fluxbase.auth.signUp({
				email: email.trim(),
				password,
				options: { data: { role: 'reader', full_name: fullName.trim() || undefined } }
			});

			if (signUpError) throw signUpError;

			// After signup, redirect back to the trip page
			if (data?.user) {
				// If email confirmation is disabled, the session is created immediately
				goto(currentPath);
			} else {
				// Email confirmation may be required — redirect to signin
				goto(`/auth/signin?redirectTo=${encodeURIComponent(currentPath)}`);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Registration failed.';
		} finally {
			isLoading = false;
		}
	}

	function handleSignIn() {
		goto(`/auth/signin?redirectTo=${encodeURIComponent(currentPath)}`);
	}
</script>

<div class="bg-card border-border rounded-xl border p-6 text-center">
	<MessageCircle class="text-primary mx-auto mb-3 h-8 w-8" />
	<h3 class="text-foreground mb-1 font-semibold">Join the conversation</h3>
	<p class="text-muted-foreground mb-4 text-sm">Register to comment and like trips.</p>

	{#if error}
		<p
			class="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
		>
			{error}
		</p>
	{/if}

	<div class="space-y-2">
		<input
			type="text"
			bind:value={fullName}
			placeholder="Name (optional)"
			class="border-border focus:ring-primary w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
		/>
		<input
			type="email"
			bind:value={email}
			placeholder="Email"
			class="border-border focus:ring-primary w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
		/>
		<input
			type="password"
			bind:value={password}
			placeholder="Password"
			onkeydown={(e) => e.key === 'Enter' && handleRegister()}
			class="border-border focus:ring-primary w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
		/>
	</div>

	<button
		type="button"
		onclick={handleRegister}
		disabled={isLoading || !email.trim() || !password.trim()}
		class="bg-primary hover:bg-primary/90 text-primary-foreground mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
	>
		{#if isLoading}
			<Loader2 class="h-4 w-4 animate-spin" />
			Creating account...
		{:else}
			Register
		{/if}
	</button>

	<p class="text-muted-foreground mt-3 text-xs">
		Already have an account?
		<button type="button" onclick={handleSignIn} class="text-primary hover:underline">
			Sign in
		</button>
	</p>
</div>
