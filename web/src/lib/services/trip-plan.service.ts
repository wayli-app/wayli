import { fluxbase } from '$lib/fluxbase';

export type PlanItem = {
	id: string;
	trip_id: string;
	user_id: string;
	day_number: number;
	sort_order: number;
	title: string;
	description: string | null;
	type: string;
	start_time: string | null;
	end_time: string | null;
	location: { lat: number; lng: number } | null;
	address: string | null;
	cost_estimate: number | null;
	currency: string;
	booking_url: string | null;
	booking_status: string;
	want_to_visit_id: string | null;
	notes: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

export type Collaborator = {
	id: string;
	trip_id: string;
	user_id: string;
	role: string;
	created_at: string;
	username?: string;
	avatar_url?: string | null;
};

export async function getPlanItems(tripId: string): Promise<PlanItem[]> {
	const { data, error } = await fluxbase
		.from('trip_plan_items')
		.select('*')
		.eq('trip_id', tripId)
		.order('day_number', { ascending: true })
		.order('sort_order', { ascending: true })
		.order('start_time', { ascending: true, nullsFirst: false });

	if (error) throw new Error(error.message);
	return (data as any[])?.map(parseLocation) ?? [];
}

export async function createPlanItem(
	item: Omit<PlanItem, 'id' | 'created_at' | 'updated_at'>
): Promise<PlanItem> {
	const { data, error } = await fluxbase
		.from('trip_plan_items')
		.insert(serializeLocation(item))
		.select('*')
		.single();

	if (error) throw new Error(error.message);
	return parseLocation(data as any);
}

export async function updatePlanItem(
	id: string,
	updates: Partial<Omit<PlanItem, 'id' | 'trip_id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<PlanItem> {
	const { data, error } = await fluxbase
		.from('trip_plan_items')
		.update(serializeLocation(updates))
		.eq('id', id)
		.select('*')
		.single();

	if (error) throw new Error(error.message);
	return parseLocation(data as any);
}

export async function deletePlanItem(id: string): Promise<void> {
	const { error } = await fluxbase.from('trip_plan_items').delete().eq('id', id);
	if (error) throw new Error(error.message);
}

export async function getCollaborators(tripId: string): Promise<Collaborator[]> {
	const { data, error } = await fluxbase
		.from('trip_collaborators')
		.select('*')
		.eq('trip_id', tripId);

	if (error) return [];

	const collaborators = (data as any[]) ?? [];

	// Fetch usernames
	if (collaborators.length > 0) {
		const userIds = collaborators.map((c) => c.user_id);
		const { data: profiles } = await fluxbase
			.from('public_profiles')
			.select('id, username, avatar_url')
			.in('id', userIds);

		const profileMap = new Map<string, any>();
		for (const p of (profiles as any[]) ?? []) {
			profileMap.set(p.id, p);
		}

		return collaborators.map((c) => ({
			...c,
			username: profileMap.get(c.user_id)?.username,
			avatar_url: profileMap.get(c.user_id)?.avatar_url
		}));
	}

	return collaborators;
}

export async function addCollaborator(
	tripId: string,
	username: string
): Promise<Collaborator | null> {
	// Find user by username
	const { data: profile } = await fluxbase
		.from('public_profiles')
		.select('id')
		.eq('username', username)
		.single();

	if (!profile) return null;

	const { data, error } = await fluxbase
		.from('trip_collaborators')
		.insert({ trip_id: tripId, user_id: (profile as any).id, role: 'editor' })
		.select('*')
		.single();

	if (error) throw new Error(error.message);
	return { ...(data as any), username };
}

export async function removeCollaborator(collaboratorId: string): Promise<void> {
	const { error } = await fluxbase.from('trip_collaborators').delete().eq('id', collaboratorId);
	if (error) throw new Error(error.message);
}

// ── Helpers ──

function parseLocation(row: any): PlanItem {
	const loc = row.location;
	let location: { lat: number; lng: number } | null = null;
	if (loc?.coordinates && Array.isArray(loc.coordinates)) {
		location = { lat: loc.coordinates[1], lng: loc.coordinates[0] };
	} else if (loc?.lat != null && loc?.lng != null) {
		location = { lat: loc.lat, lng: loc.lng };
	}
	return { ...row, location };
}

function serializeLocation(item: any): any {
	if (!item) return item;
	const { location, ...rest } = item;
	if (location && location.lat != null && location.lng != null) {
		// PostGIS GeoJSON format
		rest.location = { type: 'Point', coordinates: [location.lng, location.lat] };
	}
	return rest;
}
