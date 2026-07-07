<script lang="ts">
	import { Lock, Globe, EyeOff } from 'lucide-svelte';

	type Props = {
		value?: string;
	};

	let { value = $bindable('private') }: Props = $props();

	const options = [
		{ value: 'private', label: 'Private', icon: Lock, description: 'Only you can see this trip' },
		{ value: 'public', label: 'Public', icon: Globe, description: 'Anyone can view this trip' },
		{ value: 'unlisted', label: 'Unlisted', icon: EyeOff, description: 'Only with a direct link' }
	];
</script>

<div class="flex gap-2">
	{#each options as opt (opt.value)}
		<button
			type="button"
			onclick={() => (value = opt.value)}
			class="flex flex-1 flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs transition-colors {value ===
			opt.value
				? 'border-primary bg-primary/10 text-primary'
				: 'border-border text-muted-foreground hover:bg-muted'}"
		>
			<opt.icon class="h-4 w-4" />
			<span class="font-medium">{opt.label}</span>
		</button>
	{/each}
</div>
