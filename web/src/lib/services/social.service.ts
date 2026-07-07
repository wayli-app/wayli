/**
 * SocialService — comments + likes for trips.
 */

import { fluxbase } from '$lib/fluxbase';
import type { TripComment } from '$lib/types/social.types';

/**
 * List comments for a trip (public trips only — RLS enforces).
 * Joins public_profiles for author display.
 */
export async function listComments(tripId: string): Promise<TripComment[]> {
	const { data, error } = await fluxbase
		.from('trip_comments')
		.select(
			`
			id, trip_id, entry_id, user_id, body, created_at, updated_at
		`
		)
		.eq('trip_id', tripId)
		.order('created_at', { ascending: true });

	if (error) throw new Error(error.message);

	const comments = (data as unknown as TripComment[]) ?? [];

	// Batch-fetch author profiles
	if (comments.length > 0) {
		const userIds = [...new Set(comments.map((c) => c.user_id))];
		const { data: profiles } = await fluxbase
			.from('public_profiles')
			.select('id, full_name, avatar_url')
			.in('id', userIds);

		const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
		for (const p of (profiles as any[]) ?? []) {
			profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
		}

		for (const c of comments) {
			const profile = profileMap.get(c.user_id);
			c.author_name = profile?.full_name ?? null;
			c.author_avatar = profile?.avatar_url ?? null;
		}
	}

	return comments;
}

/**
 * Post a comment. RLS ensures the trip is public + user is authenticated.
 */
export async function createComment(
	userId: string,
	tripId: string,
	body: string,
	entryId?: string
): Promise<TripComment> {
	const { data, error } = await fluxbase
		.from('trip_comments')
		.insert({
			trip_id: tripId,
			user_id: userId,
			body,
			entry_id: entryId ?? null
		})
		.select('id, trip_id, entry_id, user_id, body, created_at, updated_at')
		.single();

	if (error) throw new Error(error.message);
	return data as unknown as TripComment;
}

/**
 * Delete a comment. RLS ensures either commenter or trip owner.
 */
export async function deleteComment(commentId: string): Promise<void> {
	const { error } = await fluxbase.from('trip_comments').delete().eq('id', commentId);
	if (error) throw new Error(error.message);
}

/**
 * Get like count + whether the current user has liked.
 */
export async function getLikeInfo(
	tripId: string,
	userId?: string
): Promise<{ count: number; liked: boolean }> {
	const { count } = await fluxbase
		.from('trip_likes')
		.select('id', { count: 'exact', head: true })
		.eq('trip_id', tripId);

	let liked = false;
	if (userId) {
		const { data } = await fluxbase
			.from('trip_likes')
			.select('id')
			.eq('trip_id', tripId)
			.eq('user_id', userId)
			.limit(1);
		liked = ((data as any[]) ?? []).length > 0;
	}

	return { count: count ?? 0, liked };
}

/**
 * Toggle a like. Returns the new liked state.
 */
export async function toggleLike(userId: string, tripId: string): Promise<{ liked: boolean }> {
	// Check if already liked
	const { data: existing } = await fluxbase
		.from('trip_likes')
		.select('id')
		.eq('trip_id', tripId)
		.eq('user_id', userId)
		.limit(1);

	if ((existing as any[])?.length > 0) {
		// Unlike
		await fluxbase.from('trip_likes').delete().eq('trip_id', tripId).eq('user_id', userId);
		return { liked: false };
	}

	// Like
	await fluxbase.from('trip_likes').insert({ trip_id: tripId, user_id: userId });
	return { liked: true };
}
