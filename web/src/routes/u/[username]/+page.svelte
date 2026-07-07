<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';
	import { MapPin, Calendar, Route } from 'lucide-svelte';

	type Profile = {
		id: string;
		username: string;
		full_name: string | null;
		avatar_url: string | null;
	};

	type PublicTrip = {
		id: string;
		title: string;
		description: string | null;
		start_date: string;
		end_date: string;
		image_url: string | null;
		visibility: string;
		metadata: Record<string, any> | null;
	};

	let profile = $state<Profile | null>(null);
	let trips = $state<PublicTrip[]>([]);
	let isLoading = $state(true);
	let notFound = $state(false);

	const username = $derived(page.params.username ?? '');

	onMount(async () => {
		// Check if public access requires auth
		const requireAuth = await readSetting(() =>
			fluxbase.settings.get('wayli.public_trips_require_auth')
		);
		if (requireAuth?.value === true || requireAuth?.value === 'true') {
			try {
				const { data } = await fluxbase.auth.getUser();
				if (!data?.user) {
					goto(`/auth/signin?redirectTo=/u/${username}`);
					return;
				}
			} catch {
				goto(`/auth/signin?redirectTo=/u/${username}`);
				return;
			}
		}

		try {
			// Load profile
			const { data: profileData } = await fluxbase
				.from('public_profiles')
				.select('*')
				.eq('username', username)
				.single();

			if (!profileData) {
				notFound = true;
				return;
			}
			profile = profileData as unknown as Profile;

			// Load public trips
			const { data: tripData } = await fluxbase
				.from('trips')
				.select('id, title, description, start_date, end_date, image_url, visibility, metadata')
				.eq('user_id', profile.id)
				.eq('visibility', 'public')
				.order('start_date', { ascending: false });

			trips = (tripData as unknown as PublicTrip[]) ?? [];
		} catch {
			notFound = true;
		} finally {
			isLoading = false;
		}
	});
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-20">
		<div class="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
	</div>
{:else if notFound}
	<div class="py-20 text-center">
		<p class="text-muted-foreground text-lg">User not found.</p>
		<a href="/" class="text-primary mt-4 inline-block hover:underline">← Home</a>
	</div>
{:else if profile}
	<div class="mx-auto max-w-4xl space-y-6 p-4">
		<!-- Profile header -->
		<div class="flex items-center gap-4">
			{#if profile.avatar_url}
				<img
					src={profile.avatar_url}
					alt={profile.full_name ?? profile.username}
					class="h-16 w-16 rounded-full object-cover"
				/>
			{/if}
			<div>
				<h1 class="text-foreground text-2xl font-bold">
					{profile.full_name ?? `@${profile.username}`}
				</h1>
				<p class="text-muted-foreground text-sm">@{profile.username}</p>
			</div>
		</div>

		<!-- Public trips -->
		{#if trips.length === 0}
			<p class="text-muted-foreground py-8 text-center">No public trips yet.</p>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each trips as trip (trip.id)}
					<a
						href="/u/{username}/trips/{trip.id}"
						class="bg-card border-border overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
					>
						{#if trip.image_url}
							<img src={trip.image_url} alt={trip.title} class="h-40 w-full object-cover" />
						{:else}
							<div class="bg-muted flex h-40 items-center justify-center">
								<Route class="text-muted-foreground h-10 w-10" />
							</div>
						{/if}
						<div class="p-4">
							<h3 class="text-foreground mb-1 font-semibold">{trip.title}</h3>
							{#if trip.description}
								<p class="text-muted-foreground line-clamp-2 text-sm">{trip.description}</p>
							{/if}
							<div class="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
								<span class="flex items-center gap-1">
									<Calendar class="h-3 w-3" />
									{new Date(trip.start_date).toLocaleDateString(undefined, {
										month: 'short',
										day: 'numeric'
									})}
								</span>
								{#if trip.metadata?.primaryCity}
									<span class="flex items-center gap-1">
										<MapPin class="h-3 w-3" />
										{trip.metadata.primaryCity}
									</span>
								{/if}
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
