import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

import { getUnreadCount } from '$lib/services/notifications.service';

/**
 * Unread-notification count for the sidebar bell badge.
 *
 * The `notifications` table is NOT enabled for Fluxbase Realtime, so this store
 * no longer subscribes to it (that subscription logged a noisy
 * "table public.notifications not enabled for realtime" error). Instead the
 * count is seeded on sign-in and refreshed by the job-store at the exact moment
 * a job goes terminal and writes a notification (see notifyTerminalJob), plus
 * on panel-open. The job-store's `jobs.queue` realtime channel IS enabled and
 * drives every job-derived notification.
 */
export const unreadCount = writable(0);

/**
 * Bumped when a notification is written (by the job-store on terminal
 * transitions, or by refreshUnread). Components with the panel open subscribe
 * to re-fetch the list so new notifications appear live without close/reopen.
 */
export const notifRefresh = writable(0);

let currentUserId: string | null = null;

/**
 * Seed the unread count for the signed-in user. Safe to call once per session.
 * (Realtime on `public.notifications` is not available — count refreshes are
 * driven by the job-store terminal handler + panel-open refetch instead.)
 */
export function initNotifications(userId: string): void {
	if (!browser || !userId || userId === currentUserId) return;
	teardownNotifications();
	currentUserId = userId;
	getUnreadCount().then((c) => unreadCount.set(c));
}

/** Reset state (sign-out). */
export function teardownNotifications(): void {
	currentUserId = null;
	unreadCount.set(0);
}

/** Force a refresh of the unread count + signal open panels to re-fetch. */
export function refreshUnread(): void {
	getUnreadCount().then((c) => unreadCount.set(c));
	notifRefresh.update((n) => n + 1);
}

// Re-export for components that want the live value reactively.
export function unreadCountValue(): number {
	return get(unreadCount);
}
