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

/**
 * Pages the assistant is aware of. The chatbot only defines explicit
 * `@fluxbase:page-contexts` for `default` and `plan`; any other value falls
 * back to the default (data-analysis) supervisor profile, so it is safe to
 * pass route-derived page labels the chatbot doesn't (yet) know about — they
 * still drive the drawer's badge text, suggestions, and the context header
 * sent with each message.
 */
export type AiPage =
	'default' | 'plan' | 'statistics' | 'trips' | 'journal' | 'want-to-visit' | (string & {});

export type AiPageContext = {
	page: AiPage;
	trip_id?: string;
	trip_title?: string;
	trip_dates?: { start: string; end: string };
	num_days?: number;
	primary_city?: string | null;
	home_city?: string | null;
	current_plan_items?: unknown;
	[key: string]: unknown;
};

/**
 * What kind of entity a suggestion acts on. The legacy default is `'plan_item'`
 * (the trip plan page). New targets (`'want_to_visit'`, `'journal_draft'`,
 * `'trip'`, `'navigate'`) are added as the assistant gains write/navigate
 * capabilities. A suggestion with no `target` is treated as `'plan_item'` for
 * backward compatibility with existing chatbot output.
 */
export type SuggestionTarget =
	'plan_item' | 'want_to_visit' | 'journal_draft' | 'trip' | 'navigate';

export type PlanSuggestion = {
	// Common
	action?: 'create' | 'update' | 'delete';
	reason?: string;
	/** Which entity this suggestion writes/navigates. Defaults to 'plan_item'. */
	target?: SuggestionTarget;
	// Create fields
	day: number;
	title: string;
	/** Plan-item type. Optional — navigate suggestions omit it. */
	type?: string;
	cost?: number | null;
	currency?: string | null;
	time?: string | null;
	end_time?: string | null;
	address?: string | null;
	end_address?: string | null;
	// Navigate target: in-app route to open via goto() (e.g. '/dashboard/travel?trip=<id>').
	href?: string;
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

// ponytail: per-page callbacks kept outside the store — Svelte stores should be
// serialisable-ish; functions are awkward to persist. Keyed by suggestion target
// so multiple page surfaces (plan items, want-to-visit, journal drafts, …) can
// register handlers concurrently. Cleared on context change per target.
type AcceptHandler = (item: PlanSuggestion) => void | Promise<void>;
const acceptHandlers = new Map<SuggestionTarget, AcceptHandler>();

function setContext(ctx: AiPageContext) {
	store.update((s) => ({ ...s, pageContext: ctx }));
	// The plan_item handler only makes sense on a plan page; clear it when
	// leaving so stale suggestions can't be accepted elsewhere. Other page
	// targets (want_to_visit, journal_draft, …) clear their own handler on
	// destroy; the navigate target is page-agnostic and left intact.
	if (ctx.page !== 'plan') acceptHandlers.delete('plan_item');
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

/** Register/unregister an accept handler for a specific suggestion target. */
function setAcceptHandler(target: SuggestionTarget, fn: AcceptHandler | null) {
	if (fn) acceptHandlers.set(target, fn);
	else acceptHandlers.delete(target);
}

/** Get the accept handler for a target, if registered. */
function getAcceptHandler(target: SuggestionTarget): AcceptHandler | undefined {
	return acceptHandlers.get(target);
}

/**
 * Resolve the handler for a suggestion: honors an explicit `target`, falling
 * back to the legacy single-handler behaviour (plan_item) when none is set.
 */
function getHandlerForSuggestion(item: PlanSuggestion): AcceptHandler | undefined {
	const target = item.target ?? 'plan_item';
	return acceptHandlers.get(target);
}

// --- Legacy API (kept so the existing plan-page wiring compiles unchanged) ---
/** @deprecated Use setAcceptHandler('plan_item', fn) instead. */
function setAcceptSuggestionHandler(fn: AcceptHandler | null) {
	setAcceptHandler('plan_item', fn);
}

/** @deprecated Use getAcceptHandler('plan_item') instead. */
function getAcceptSuggestionHandler() {
	return acceptHandlers.get('plan_item') ?? null;
}

export const aiDrawer = {
	subscribe: store.subscribe,
	open,
	close,
	toggle,
	setContext,
	setAcceptHandler,
	getAcceptHandler,
	getHandlerForSuggestion,
	setAcceptSuggestionHandler,
	getAcceptSuggestionHandler
};
