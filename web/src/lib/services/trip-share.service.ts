import { fluxbase } from '$lib/fluxbase';
import { fetchTrackPoints } from '$lib/services/gps.service';

export type TripShare = {
	id: string;
	trip_id: string;
	shared_with_user_id: string;
	role: string;
	created_at: string;
	username?: string;
	avatar_url?: string | null;
};

export async function getTripShares(tripId: string): Promise<TripShare[]> {
	const { data, error } = await fluxbase
		.from('trip_shares')
		.select('*')
		.eq('trip_id', tripId)
		.order('created_at', { ascending: false });

	if (error || !data) return [];

	// Fetch profiles
	const userIds = (data as any[]).map((s) => s.shared_with_user_id);
	if (userIds.length === 0) return [];

	const { data: profiles } = await fluxbase
		.from('public_profiles')
		.select('id, username, avatar_url')
		.in('id', userIds);

	const profileMap = new Map<string, any>();
	for (const p of (profiles as any[]) ?? []) {
		profileMap.set(p.id, p);
	}

	return (data as any[]).map((s) => ({
		...s,
		username: profileMap.get(s.shared_with_user_id)?.username,
		avatar_url: profileMap.get(s.shared_with_user_id)?.avatar_url
	}));
}

export async function shareTrip(
	tripId: string,
	userId: string,
	role: string = 'viewer'
): Promise<void> {
	const { error } = await fluxbase.from('trip_shares').insert({
		trip_id: tripId,
		shared_with_user_id: userId,
		role
	});
	if (error) throw new Error(error.message);
}

export async function unshareTrip(tripId: string, userId: string): Promise<void> {
	const { error } = await fluxbase
		.from('trip_shares')
		.delete()
		.eq('trip_id', tripId)
		.eq('shared_with_user_id', userId);
	if (error) throw new Error(error.message);
}

export async function updateShareRole(tripId: string, userId: string, role: string): Promise<void> {
	const { error } = await fluxbase
		.from('trip_shares')
		.update({ role })
		.eq('trip_id', tripId)
		.eq('shared_with_user_id', userId);
	if (error) throw new Error(error.message);
}

export async function getSharedTrips(userId: string): Promise<string[]> {
	const { data, error } = await fluxbase
		.from('trip_shares')
		.select('trip_id')
		.eq('shared_with_user_id', userId);

	if (error || !data) return [];
	return (data as any[]).map((s) => s.trip_id);
}
