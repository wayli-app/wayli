/**
 * Global AI drawer store.
 *
 * Single chatbot (wayli-assistant) with page-aware context. The drawer mounts
 * once in the dashboard layout; any route can call `aiDrawer.open()` or
 * `aiDrawer.setContext(...)` to control it.
 *
 * The plan page sets `page: 'plan'` plus trip context and registers an
 * `onAcceptSuggestion` callback so the supervisor's plan-item JSON can be
 * accepted into the trip's plan_items table.
 */

import { writable, type Writable } from 'svelte/store';

export type AiPageContext = {
	page: 'default' | 'plan';
	trip_id?: string;
	trip_title?: string;
	trip_dates?: { start: string; end: string };
	num_days?: number;
	primary_city?: string | null;
	home_city?: string | null;
	current_plan_items?: unknown;
	[key: string]: unknown;
};

export type PlanSuggestion = {
	// Common
	action?: 'create' | 'update' | 'delete';
	reason?: string;
	// Create fields
	day: number;
	title: string;
	type: string;
	cost?: number | null;
	currency?: string | null;
	time?: string | null;
	end_time?: string | null;
	address?: string | null;
	end_address?: string | null;
	// Update/Delete fields
	item_id?: string;
	changes?: Partial<{
		title: string;
		type: string;
		time: string | null;
		end_time: string | null;
		cost: number | null;
		currency: string | null;
		address: string | null;
		end_address: string | null;
	}>;
};

type AiDrawerState = {
	open: boolean;
	pageContext: AiPageContext;
};

const DEFAULT_STATE: AiDrawerState = {
	open: false,
	pageContext: { page: 'default' }
};

const store: Writable<AiDrawerState> = writable<AiDrawerState>({ ...DEFAULT_STATE });

// ponytail: per-page callback kept outside the store — Svelte stores should be
// serialisable-ish; functions are awkward to persist. Cleared on context change.
let acceptSuggestionHandler: ((item: PlanSuggestion) => void | Promise<void>) | null = null;

function setContext(ctx: AiPageContext) {
	store.update((s) => ({ ...s, pageContext: ctx }));
	// Clear handler when leaving plan mode
	if (ctx.page !== 'plan') acceptSuggestionHandler = null;
}

function open(ctx?: AiPageContext) {
	if (ctx) setContext(ctx);
	store.update((s) => ({ ...s, open: true }));
}

function close() {
	store.update((s) => ({ ...s, open: false }));
}

function toggle() {
	store.update((s) => ({ ...s, open: !s.open }));
}

function setAcceptSuggestionHandler(fn: ((item: PlanSuggestion) => void | Promise<void>) | null) {
	acceptSuggestionHandler = fn;
}

function getAcceptSuggestionHandler() {
	return acceptSuggestionHandler;
}

export const aiDrawer = {
	subscribe: store.subscribe,
	open,
	close,
	toggle,
	setContext,
	setAcceptSuggestionHandler,
	getAcceptSuggestionHandler
};
