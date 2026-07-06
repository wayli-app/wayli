<script lang="ts">
	import { Shield, User } from 'lucide-svelte';

	let { role = $bindable('user') }: { role: 'admin' | 'user' } = $props();

	const roles = [
		{
			id: 'user',
			label: 'User',
			icon: User,
			description: 'Can view and manage their own trips and data.'
		},
		{
			id: 'admin',
			label: 'Admin',
			icon: Shield,
			description: 'Has full access to all settings and can manage all users.'
		}
	];
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
	{#each roles as roleOption (roleOption.id)}
		<button
			type="button"
			class="rounded-lg border-2 p-4 text-left transition-all {role === roleOption.id
				? 'border-primary bg-primary/5 dark:bg-primary/30'
				: 'border-gray-300 hover:border-border dark:border-border dark:hover:border-border'}"
			onclick={() => (role = roleOption.id as 'admin' | 'user')}
		>
			<div class="mb-2 flex items-center">
				<roleOption.icon
					class="mr-3 h-5 w-5 {role === roleOption.id
						? 'text-primary dark:text-muted-foreground'
						: 'text-muted-foreground'}"
				/>
				<span class="font-semibold text-foreground">{roleOption.label}</span>
			</div>
			<p class="text-sm text-muted-foreground">{roleOption.description}</p>
		</button>
	{/each}
</div>
