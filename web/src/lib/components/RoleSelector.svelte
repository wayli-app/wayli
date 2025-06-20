<script lang="ts">
	import { Shield, User } from 'lucide-svelte';

	export let role: 'admin' | 'user' = 'user';

	const roles = [
		{ id: 'user', label: 'User', icon: User, description: 'Can view and manage their own trips and data.' },
		{ id: 'admin', label: 'Admin', icon: Shield, description: 'Has full access to all settings and can manage all users.' }
	];
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
	{#each roles as roleOption}
		<button
			type="button"
			class="text-left p-4 rounded-lg border-2 transition-all {role === roleOption.id
				? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
				: 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}"
			on:click={() => (role = roleOption.id)}
		>
			<div class="flex items-center mb-2">
				<svelte:component this={roleOption.icon} class="h-5 w-5 mr-3 {role === roleOption.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}" />
				<span class="font-semibold text-gray-900 dark:text-gray-100">{roleOption.label}</span>
			</div>
			<p class="text-sm text-gray-600 dark:text-gray-400">{roleOption.description}</p>
		</button>
	{/each}
</div>