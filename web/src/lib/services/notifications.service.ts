import { fluxbase } from '$lib/fluxbase';
import type { AppNotification } from '$lib/types/notification.types';

/**
 * Persistent in-app notifications (jobs completing/failing, trip suggestions, …).
 * Backed by the `notifications` table (owner-private via RLS).
 *
 * Notifications are created client-side by the job-store on terminal job
 * transitions (see createNotification), so they survive past the transient
 * ~60s job-state window.
 */

const TABLE = 'notifications';

/** Fetch the most recent notifications for the signed-in user. */
export async function listNotifications(limit = 30): Promise<AppNotification[]> {
	const { data, error } = await fluxbase
		.from(TABLE)
		.select('id, user_id, type, title, body, icon, link, related_job_id, read_at, created_at')
		.order('created_at', { ascending: false })
		.limit(limit);
	if (error) {
		console.warn('[notifications] list error:', error);
		return [];
	}
	return (data as AppNotification[]) ?? [];
}

/** Count of unread notifications for the badge. */
export async function getUnreadCount(): Promise<number> {
	const { count, error } = await fluxbase
		.from(TABLE)
		.select('*', { count: 'exact', head: true })
		.is('read_at', null);
	if (error) {
		console.warn('[notifications] unread count error:', error);
		return 0;
	}
	return count ?? 0;
}

/**
 * Create a notification for the current user. RLS requires user_id to match
 * auth.uid(). Best-effort: errors are swallowed (notifications are non-critical).
 */
export async function createNotification(input: {
	type: AppNotification['type'];
	title: string;
	body?: string;
	icon?: string;
	link?: string;
	related_job_id?: string;
}): Promise<void> {
	try {
		// The (user_id, related_job_id) UNIQUE constraint dedupes against the
		// jobs.queue trigger (migration 083): if the trigger already created a
		// notification for this job, this insert is a no-op error we swallow.
		const { error } = await fluxbase.from(TABLE).insert({
			type: input.type,
			title: input.title,
			body: input.body ?? '',
			icon: input.icon ?? null,
			link: input.link ?? null,
			related_job_id: input.related_job_id ?? null
		});
		if (error && !(error as any)?.code?.includes('23505')) {
			// 23505 = unique_violation (expected dedup with the trigger); ignore it.
			console.warn('[notifications] insert error:', error);
		}
	} catch (e) {
		console.warn('[notifications] insert failed:', e);
	}
}

/** Mark a single notification as read. */
export async function markRead(id: string): Promise<void> {
	const { error } = await fluxbase
		.from(TABLE)
		.update({ read_at: new Date().toISOString() })
		.eq('id', id);
	if (error) console.warn('[notifications] markRead error:', error);
}

/** Mark all unread notifications for the user as read. */
export async function markAllRead(): Promise<void> {
	const { error } = await fluxbase
		.from(TABLE)
		.update({ read_at: new Date().toISOString() })
		.is('read_at', null);
	if (error) console.warn('[notifications] markAllRead error:', error);
}

/** Delete a single notification. */
export async function deleteNotification(id: string): Promise<void> {
	const { error } = await fluxbase.from(TABLE).delete().eq('id', id);
	if (error) console.warn('[notifications] delete error:', error);
}
