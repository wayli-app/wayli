import { fluxbase } from '$lib/fluxbase';

export type ConnectionStatus = 'pending' | 'accepted' | 'blocked';

export type UserConnection = {
	id: string;
	user_id: string;
	friend_id: string;
	status: ConnectionStatus;
	created_at: string;
	// Joined fields
	username?: string;
	avatar_url?: string | null;
	full_name?: string | null;
};

export async function searchUsers(
	query: string,
	currentUserId?: string
): Promise<
	Array<{ id: string; username: string; full_name: string | null; avatar_url: string | null }>
> {
	if (!query.trim() || query.trim().length < 2) return [];

	const { data, error } = await fluxbase
		.from('public_profiles')
		.select('id, username, full_name, avatar_url, discoverable')
		.ilike('username', `%${query.trim()}%`)
		.limit(20);

	if (error || !data) return [];

	return (data as any[])
		.filter((user) => {
			if (user.id === currentUserId) return false;
			const setting = user.discoverable ?? 'everyone';
			if (setting === 'nobody') return false;
			return true; // 'everyone' and 'friends_of_friends' included for now
		})
		.map(({ discoverable: _, ...rest }) => rest);
}

export async function sendFriendRequest(userId: string, friendId: string): Promise<void> {
	const { error } = await fluxbase.from('user_connections').insert({
		user_id: userId,
		friend_id: friendId,
		status: 'pending'
	});
	if (error) throw new Error(error.message);
}

export async function acceptFriendRequest(connectionId: string): Promise<void> {
	const { error } = await fluxbase
		.from('user_connections')
		.update({ status: 'accepted' })
		.eq('id', connectionId);
	if (error) throw new Error(error.message);

	// Create the reverse connection (bidirectional)
	const { data } = await fluxbase
		.from('user_connections')
		.select('user_id, friend_id')
		.eq('id', connectionId)
		.single();

	if (data) {
		// Insert reverse connection if it doesn't exist
		await fluxbase.from('user_connections').upsert(
			{
				user_id: (data as any).friend_id,
				friend_id: (data as any).user_id,
				status: 'accepted'
			},
			{ onConflict: 'user_id,friend_id' }
		);
	}
}

export async function rejectFriendRequest(connectionId: string): Promise<void> {
	const { error } = await fluxbase.from('user_connections').delete().eq('id', connectionId);
	if (error) throw new Error(error.message);
}

export async function getFriends(userId: string): Promise<UserConnection[]> {
	const { data, error } = await fluxbase
		.from('user_connections')
		.select('*')
		.eq('status', 'accepted')
		.or(`user_id.eq.${userId},friend_id.eq.${userId}`)
		.order('created_at', { ascending: false });

	if (error || !data) return [];

	// Fetch profiles for all connected users
	const connectionIds = [
		...new Set(
			(data as any[]).flatMap((c) => [c.user_id, c.friend_id]).filter((id) => id !== userId)
		)
	];

	if (connectionIds.length === 0) return [];

	const { data: profiles } = await fluxbase
		.from('public_profiles')
		.select('id, username, full_name, avatar_url')
		.in('id', connectionIds);

	const profileMap = new Map<string, any>();
	for (const p of (profiles as any[]) ?? []) {
		profileMap.set(p.id, p);
	}

	return (data as any[]).map((c) => {
		const otherId = c.user_id === userId ? c.friend_id : c.user_id;
		const profile = profileMap.get(otherId);
		return {
			...c,
			username: profile?.username,
			avatar_url: profile?.avatar_url,
			full_name: profile?.full_name
		};
	});
}

export async function getPendingRequests(userId: string): Promise<UserConnection[]> {
	const { data, error } = await fluxbase
		.from('user_connections')
		.select('*')
		.eq('friend_id', userId)
		.eq('status', 'pending')
		.order('created_at', { ascending: false });

	if (error || !data) return [];

	// Fetch requester profiles
	const requesterIds = (data as any[]).map((c) => c.user_id);
	if (requesterIds.length === 0) return [];

	const { data: profiles } = await fluxbase
		.from('public_profiles')
		.select('id, username, full_name, avatar_url')
		.in('id', requesterIds);

	const profileMap = new Map<string, any>();
	for (const p of (profiles as any[]) ?? []) {
		profileMap.set(p.id, p);
	}

	return (data as any[]).map((c) => ({
		...c,
		username: profileMap.get(c.user_id)?.username,
		avatar_url: profileMap.get(c.user_id)?.avatar_url,
		full_name: profileMap.get(c.user_id)?.full_name
	}));
}
