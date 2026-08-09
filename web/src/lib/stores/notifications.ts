import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

import { fluxbase } from '$lib/fluxbase';
import { getUnreadCount } from '$lib/services/notifications.service';

/**
 * Unread-notification count for the sidebar bell badge, kept live via a
 * Realtime subscription to the `notifications` table.
 *
 * Initialized by the session manager on sign-in (initNotifications(userId)),
 * torn down on sign-out. The full notification *list* is loaded on demand by
 * the NotificationsButton popover — only the count lives here.
 */
export const unreadCount = writable(0);

/**
 * Bumped on every realtime notifications change (INSERT/UPDATE/DELETE).
 * Components with the panel open subscribe to this to re-fetch the list so a
 * newly-completed job's notification appears live without close/reopen.
 * (Mirrors the job-store pattern the NotificationsButton already uses.)
 */
export const notifRefresh = writable(0);

let channel: ReturnType<typeof fluxbase.realtime.channel> | null = null;
let currentUserId: string | null = null;

function bumpUnread(delta: number) {
	unreadCount.update((c) => Math.max(0, c + delta));
}

/**
 * Subscribe to realtime changes on the user's notifications and seed the
 * unread count. Safe to call once per session.
 */
export function initNotifications(userId: string): void {
	if (!browser || !userId || userId === currentUserId) return;
	teardownNotifications();
	currentUserId = userId;

	// Seed the count.
	getUnreadCount().then((c) => unreadCount.set(c));

	channel = fluxbase.realtime
		.channel(`notifications:${userId}`)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'notifications',
				filter: `user_id=eq.${userId}`
			},
			(payload: any) => {
				// Recompute on any change — cheapest and always-correct option,
				// and the volume is low (a handful of notifications per job run).
				getUnreadCount().then((c) => unreadCount.set(c));
				// Signal an open panel to re-fetch its list so new notifications
				// appear live (e.g. a job completing while the panel is open).
				notifRefresh.update((n) => n + 1);
				// Suppress unused-var lint for payload.
				void payload;
			}
		)
		.subscribe();
}

/** Stop the realtime subscription and reset state (sign-out). */
export function teardownNotifications(): void {
	if (channel) {
		try {
			fluxbase.realtime.removeChannel(channel);
		} catch {
			// best-effort
		}
		channel = null;
	}
	currentUserId = null;
	unreadCount.set(0);
}

/** Force a refresh of the unread count (e.g. after marking all read). */
export function refreshUnread(): void {
	getUnreadCount().then((c) => unreadCount.set(c));
}

// Re-export for components that want the live value reactively.
export function unreadCountValue(): number {
	return get(unreadCount);
}
