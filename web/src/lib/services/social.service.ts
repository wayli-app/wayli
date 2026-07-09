/**
 * SocialService — comments + likes for journal entries.
 * Engagement is per-entry (not per-trip).
 */

import { fluxbase } from '$lib/fluxbase';
import type { TripComment } from '$lib/types/social.types';

/**
 * List comments for a specific journal entry.
 */
export async function listEntryComments(entryId: string): Promise<TripComment[]> {
	const { data, error } = await fluxbase
		.from('trip_comments')
		.select('id, trip_id, entry_id, user_id, body, created_at, updated_at')
		.eq('entry_id', entryId)
		.order('created_at', { ascending: true });

	if (error) throw new Error(error.message);

	const comments = (data as unknown as TripComment[]) ?? [];

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
 * Post a comment on a journal entry.
 */
export async function createEntryComment(
	userId: string,
	tripId: string,
	entryId: string,
	body: string
): Promise<TripComment> {
	const { data, error } = await fluxbase
		.from('trip_comments')
		.insert({
			trip_id: tripId,
			entry_id: entryId,
			user_id: userId,
			body
		})
		.select('id, trip_id, entry_id, user_id, body, created_at, updated_at')
		.single();

	if (error) throw new Error(error.message);
	return data as unknown as TripComment;
}

/**
 * Delete a comment.
 */
export async function deleteComment(commentId: string): Promise<void> {
	const { error } = await fluxbase.from('trip_comments').delete().eq('id', commentId);
	if (error) throw new Error(error.message);
}

/**
 * Get like count + whether the current user has liked an entry.
 */
export async function getEntryLikeInfo(
	entryId: string,
	userId?: string
): Promise<{ count: number; liked: boolean }> {
	const { count } = await fluxbase
		.from('trip_likes')
		.select('id', { count: 'exact', head: true })
		.eq('entry_id', entryId);

	let liked = false;
	if (userId) {
		const { data } = await fluxbase
			.from('trip_likes')
			.select('id')
			.eq('entry_id', entryId)
			.eq('user_id', userId)
			.limit(1);
		liked = ((data as any[]) ?? []).length > 0;
	}

	return { count: count ?? 0, liked };
}

/**
 * Toggle a like on an entry.
 */
export async function toggleEntryLike(
	userId: string,
	tripId: string,
	entryId: string
): Promise<{ liked: boolean }> {
	const { data: existing } = await fluxbase
		.from('trip_likes')
		.select('id')
		.eq('entry_id', entryId)
		.eq('user_id', userId)
		.limit(1);

	if ((existing as any[])?.length > 0) {
		await fluxbase.from('trip_likes').delete().eq('entry_id', entryId).eq('user_id', userId);
		return { liked: false };
	}

	await fluxbase.from('trip_likes').insert({ trip_id: tripId, entry_id: entryId, user_id: userId });
	return { liked: true };
}
