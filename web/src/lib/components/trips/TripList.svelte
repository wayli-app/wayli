<script lang="ts">
	import {
		Edit,
		MapPin,
		BarChart2,
		Trash2,
		Map,
		Search,
		ArrowUp,
		ArrowDown,
		List,
		LayoutGrid
	} from 'lucide-svelte';
	import { t } from '$lib/i18n';

	export let trips: {
		title: string;
		labels: string[];
		distance: string;
		startDate: string;
		duration: string;
		countries: string[];
		image: string;
		lat: number;
		lng: number;
	}[];
	export let onDelete: (trip: (typeof trips)[0]) => void;
	export let onMouseEnter: ((trip: (typeof trips)[0]) => void) | undefined = undefined;

	let sortField: keyof (typeof trips)[0] = 'startDate';
	let sortDirection: 'asc' | 'desc' = 'desc';
	let searchQuery = '';
	let view = 'list';

	$: filteredTrips = trips.filter((trip) =>
		trip.title.toLowerCase().includes(searchQuery.toLowerCase())
	);

	$: sortedTrips = [...filteredTrips].sort((a, b) => {
		const aValue = a[sortField];
		const bValue = b[sortField];
		const direction = sortDirection === 'asc' ? 1 : -1;

		if (sortField === 'startDate' && typeof aValue === 'string' && typeof bValue === 'string') {
			return direction * (new Date(aValue).getTime() - new Date(bValue).getTime());
		}

		if (typeof aValue === 'string' && typeof bValue === 'string') {
			return direction * aValue.localeCompare(bValue);
		}

		return 0;
	});

	function toggleSort(field: keyof (typeof trips)[0]) {
		if (sortField === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDirection = 'desc';
		}
	}

	function handleRowHover(trip: (typeof trips)[0]) {
		if (onMouseEnter) {
			onMouseEnter(trip);
		}
	}
</script>

<div class="space-y-4">
	<div class="relative">
		<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
		<input
			type="text"
			bind:value={searchQuery}
			placeholder={t('trips.searchTrips')}
			class="border-border focus:border-primary focus:ring-primary w-full rounded-md border bg-white py-2 pr-4 pl-10 text-sm placeholder:text-gray-400 focus:ring-1 focus:outline-none"
		/>
	</div>

	<div class="border-border dark:border-border dark:bg-card rounded-lg border bg-white">
		<table class="w-full">
			<thead>
				<tr class="border-border dark:border-border dark:bg-card border-b bg-white">
					<th class="w-8 px-6 py-4">
						<input type="checkbox" class="dark:border-border rounded border-gray-300" />
					</th>
					<th class="px-6 py-4">
						<button
							class="hover:text-primary dark:hover:text-primary text-foreground flex cursor-pointer items-center gap-1 text-left text-sm font-medium"
							onclick={() => toggleSort('title')}
						>
							Trip Name
							{#if sortField === 'title'}
								<span class="text-primary dark:text-primary">
									{#if sortDirection === 'asc'}
										<ArrowUp class="h-4 w-4" />
									{:else}
										<ArrowDown class="h-4 w-4" />
									{/if}
								</span>
							{/if}
						</button>
					</th>
					<th class="px-6 py-4">
						<button
							class="hover:text-primary dark:hover:text-primary text-foreground flex cursor-pointer items-center gap-1 text-left text-sm font-medium"
							onclick={() => toggleSort('labels')}
						>
							Labels
							{#if sortField === 'labels'}
								<span class="text-primary dark:text-primary">
									{#if sortDirection === 'asc'}
										<ArrowUp class="h-4 w-4" />
									{:else}
										<ArrowDown class="h-4 w-4" />
									{/if}
								</span>
							{/if}
						</button>
					</th>
					<th class="px-6 py-4">
						<button
							class="hover:text-primary dark:hover:text-primary text-foreground flex cursor-pointer items-center gap-1 text-left text-sm font-medium"
							onclick={() => toggleSort('distance')}
						>
							Distance
							{#if sortField === 'distance'}
								<span class="text-primary dark:text-primary">
									{#if sortDirection === 'asc'}
										<ArrowUp class="h-4 w-4" />
									{:else}
										<ArrowDown class="h-4 w-4" />
									{/if}
								</span>
							{/if}
						</button>
					</th>
					<th class="px-6 py-4">
						<button
							class="hover:text-primary dark:hover:text-primary text-foreground flex cursor-pointer items-center gap-1 text-left text-sm font-medium"
							onclick={() => toggleSort('startDate')}
						>
							Start Date
							{#if sortField === 'startDate'}
								<span class="text-primary dark:text-primary">
									{#if sortDirection === 'asc'}
										<ArrowUp class="h-4 w-4" />
									{:else}
										<ArrowDown class="h-4 w-4" />
									{/if}
								</span>
							{/if}
						</button>
					</th>
					<th class="px-6 py-4">
						<button
							class="hover:text-primary dark:hover:text-primary text-foreground flex cursor-pointer items-center gap-1 text-left text-sm font-medium"
							onclick={() => toggleSort('duration')}
						>
							Duration
							{#if sortField === 'duration'}
								<span class="text-primary dark:text-primary">
									{#if sortDirection === 'asc'}
										<ArrowUp class="h-4 w-4" />
									{:else}
										<ArrowDown class="h-4 w-4" />
									{/if}
								</span>
							{/if}
						</button>
					</th>
					<th class="text-foreground px-6 py-4 text-sm font-medium">Countries</th>
					<th class="text-foreground px-6 py-4 text-sm font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedTrips as trip (trip.title)}
					<tr
						class="border-border hover:bg-muted dark:border-border dark:hover:bg-muted border-b"
						onmouseenter={() => handleRowHover(trip)}
					>
						<td class="w-8 px-6 py-4">
							<input type="checkbox" class="dark:border-border rounded border-gray-300" />
						</td>
						<td class="text-foreground px-6 py-4 text-sm font-medium">{trip.title}</td>
						<td class="px-6 py-4">
							<div class="flex gap-1">
								{#each trip.labels as label (label)}
									<span
										class="rounded-full px-2 py-0.5 text-xs font-medium
                    {label === 'Adventure'
											? 'bg-red-100 text-red-700'
											: label === 'Nature'
												? 'bg-green-100 text-green-700'
												: label === 'Roadtrip'
													? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
													: label === 'Vacation'
														? 'bg-purple-100 text-purple-700'
														: label === 'auto-generated'
															? 'bg-gray-100 text-gray-700'
															: 'bg-gray-100 text-gray-700'}"
									>
										{label}
									</span>
								{/each}
							</div>
						</td>
						<td class="text-muted-foreground px-6 py-4 text-sm">{trip.distance}</td>
						<td class="text-muted-foreground px-6 py-4 text-sm">{trip.startDate}</td>
						<td class="text-muted-foreground px-6 py-4 text-sm">{trip.duration}</td>
						<td class="px-6 py-4">
							<div class="flex gap-1">
								{#each trip.countries as country (country)}
									<img
										src={`https://flagcdn.com/w20/${country.toLowerCase()}.png`}
										alt={country}
										class="h-4 w-6 rounded"
									/>
								{/each}
							</div>
						</td>
						<td class="px-6 py-4">
							<div class="flex justify-end gap-2">
								<button class="hover:bg-muted cursor-pointer rounded p-1" aria-label="Edit">
									<Edit class="text-muted-foreground h-4 w-4" />
								</button>
								<button
									class="hover:bg-muted cursor-pointer rounded p-1"
									aria-label="View points of interest"
								>
									<MapPin class="text-muted-foreground h-4 w-4" />
								</button>
								<button
									class="hover:bg-muted cursor-pointer rounded p-1"
									aria-label="View statistics"
								>
									<BarChart2 class="text-muted-foreground h-4 w-4" />
								</button>
								<button class="hover:bg-muted cursor-pointer rounded p-1" aria-label="View on map">
									<Map class="text-muted-foreground h-4 w-4" />
								</button>
								<button
									class="hover:bg-muted cursor-pointer rounded p-1 text-red-500 hover:text-red-600"
									aria-label="Delete"
									onclick={() => onDelete(trip)}
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex items-center gap-2">
		<button
			class="border-border hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted cursor-pointer rounded-md border bg-white p-2 text-gray-600"
			class:bg-primary={view === 'list'}
			class:text-white={view === 'list'}
			class:border-primary={view === 'list'}
			onclick={() => (view = 'list')}
		>
			<List class="h-5 w-5" />
		</button>
		<button
			class="border-border hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted cursor-pointer rounded-md border bg-white p-2 text-gray-600"
			class:bg-primary={view === 'tiles'}
			class:text-white={view === 'tiles'}
			class:border-primary={view === 'tiles'}
			onclick={() => (view = 'tiles')}
		>
			<LayoutGrid class="h-5 w-5" />
		</button>
	</div>
</div>
