<script lang="ts">
	import { Loader2 } from 'lucide-svelte';

	// Props
	let {
		value = $bindable(''),
		placeholder = '',
		onSelect,
		onInput: onInputProp,
		size = 'sm',
		disabled = false
	}: {
		value?: string | null;
		placeholder?: string;
		onSelect?: (result: { label: string; lat: number; lng: number; raw: any }) => void;
		onInput?: (value: string) => void;
		size?: 'sm' | 'md';
		disabled?: boolean;
	} = $props();

	let results = $state<Array<{ properties: any; geometry: any }>>([]);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let isSearching = $state(false);
	let isFocused = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm';

	async function onInput(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		value = v;
		onInputProp?.(v);
		if (timer) clearTimeout(timer);
		if (v.length < 3) {
			results = [];
			return;
		}
		timer = setTimeout(async () => {
			isSearching = true;
			try {
				const { getPeliasEndpoint } = await import('$lib/services/external/pelias.service');
				const endpoint = await getPeliasEndpoint();
				const res = await fetch(
					`${endpoint}/v1/autocomplete?text=${encodeURIComponent(v)}&size=5`,
					{ headers: { Accept: 'application/json' } }
				);
				if (!res.ok) {
					results = [];
					return;
				}
				const data = await res.json();
				results = data.features ?? [];
			} catch {
				results = [];
			} finally {
				isSearching = false;
			}
		}, 300);
	}

	function pick(feat: any) {
		const [lng, lat] = feat.geometry?.coordinates ?? [null, null];
		const label = feat.properties?.label ?? feat.properties?.name ?? value;
		value = label;
		results = [];
		inputEl?.blur();
		isFocused = false;
		onSelect?.({ label, lat, lng, raw: feat });
	}

	function onKeydown(e: KeyboardEvent) {
		// Enter on first result when results exist and user hasn't explicitly picked
		if (e.key === 'Enter' && results.length > 0) {
			e.preventDefault();
			pick(results[0]);
		} else if (e.key === 'Escape') {
			results = [];
			isFocused = false;
			inputEl?.blur();
		}
	}

	function onFocus() {
		isFocused = true;
	}

	function onBlur() {
		// Delay so click on result fires first
		setTimeout(() => {
			isFocused = false;
			results = [];
		}, 200);
	}
</script>

<div class="relative">
	<input
		bind:this={inputEl}
		type="text"
		{value}
		{placeholder}
		{disabled}
		oninput={onInput}
		onkeydown={onKeydown}
		onfocus={onFocus}
		onblur={onBlur}
		class="border-border bg-card text-foreground focus:ring-primary w-full rounded border {sizeClass} focus:ring-2 focus:outline-none disabled:opacity-50"
	/>
	{#if isSearching && isFocused}
		<div
			class="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2"
		>
			<Loader2 class="h-3 w-3 animate-spin" />
		</div>
	{/if}
	{#if results.length > 0 && isFocused}
		<ul
			class="bg-card border-border absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border shadow-lg"
			role="listbox"
		>
			{#each results as feat, idx (idx)}
				<li>
					<button
						type="button"
						onclick={() => pick(feat)}
						onmousedown={(e) => e.preventDefault()}
						role="option"
						aria-selected="false"
						class="hover:bg-muted block w-full px-2.5 py-1.5 text-left text-xs"
					>
						<div class="text-foreground truncate font-medium">
							{feat.properties?.name ?? feat.properties?.label ?? 'Unnamed'}
						</div>
						{#if feat.properties?.label && feat.properties?.name && feat.properties.label !== feat.properties.name}
							<div class="text-muted-foreground truncate text-[10px]">
								{feat.properties.label}
							</div>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
