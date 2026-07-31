/**
 * Pure suggestion-parsing helpers for the AI assistant.
 *
 * Extracted from AiDrawer.svelte so the model-output contract (fenced/unfenced
 * JSON, tolerant fixups for common LLM quirks, and typed entity-link chips) is
 * unit-testable independent of the Svelte component. These functions have no
 * side effects and no access to component state.
 */

import type { PlanSuggestion } from '$lib/stores/ai-drawer';

export type ParsedSuggestion = PlanSuggestion;

/**
 * Tolerantly parse a JSON array string into suggestions. Handles common LLM
 * output quirks: trailing commas before `}`/`]`, and single-quoted strings.
 * Returns null when parsing fails or the result isn't a non-empty array.
 */
export function safeJsonArrayParse(raw: string): ParsedSuggestion[] | null {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
	} catch {
		// Fall through to tolerant fixups.
	}
	try {
		const fixed = raw
			.replace(/,\s*([}\]])/g, '$1') // trailing commas before } ]
			.replace(/'([^']*)'(\s*:)/g, '"$1"$2') // 'key':
			.replace(/:\s*'([^']*)'/g, ': "$1"') // : 'value'
			.replace(/'([^']*)'/g, '"$1"'); // remaining 'str'
		const parsed = JSON.parse(fixed);
		return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Parse typed entity links the model emits, e.g.
 *   [trip:<uuid>|Berlin trip]   [place:<lat>,<lng>|Brandenburg Gate]
 * into navigate suggestions (open via goto in the app).
 */
export function extractNavLinks(content: string): ParsedSuggestion[] {
	const out: ParsedSuggestion[] = [];
	const re = /\[(trip|place|trip-plan):([^\]|]+)\|([^\]]+)\]/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) {
		const kind = m[1].toLowerCase();
		const ref = m[2].trim();
		const label = m[3].trim();
		let href = '';
		if (kind === 'trip') href = `/dashboard/travel?trip=${encodeURIComponent(ref)}`;
		else if (kind === 'place') {
			const [lat, lng] = ref.split(',').map((s) => s.trim());
			href = `/dashboard/statistics?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
		} else if (kind === 'trip-plan') href = `/dashboard/travel/${encodeURIComponent(ref)}/plan`;
		if (href) out.push({ target: 'navigate', action: 'create', day: 0, title: label, href });
	}
	return out;
}

/**
 * Extract suggestions from an assistant message. Tries, in order:
 *  1. Any fenced code block (```, with or without a `json` tag).
 *  2. The LAST raw JSON array in the content (models often append it).
 *  3. Typed entity-link chips ([trip:…|…]).
 *  4. Markdown bullet parsing (delegated to the caller — plan-mode-only).
 *
 * `fallback` lets the component inject its bullet parser without this module
 * depending on the page context (which is component state).
 */
export function extractSuggestions(
	content: string,
	fallback?: (content: string) => ParsedSuggestion[]
): ParsedSuggestion[] {
	// 1. Any fenced block (json tag optional).
	const fenced = content.match(/```(?:json)?\s*\n?(\[[\s\S]*?\])\s*\n?```/i);
	if (fenced) {
		const parsed = safeJsonArrayParse(fenced[1]);
		if (parsed) return parsed;
	}
	// 2. Last raw JSON array in the content.
	const arrays = content.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
	if (arrays && arrays.length > 0) {
		const parsed = safeJsonArrayParse(arrays[arrays.length - 1]);
		if (parsed) return parsed;
	}
	// 3. Typed entity-link chips.
	const nav = extractNavLinks(content);
	if (nav.length > 0) return nav;
	// 4. Caller-provided bullet fallback.
	return fallback ? fallback(content) : [];
}

/**
 * Whether an assistant turn *looks* like it proposed plan items but failed to
 * parse — a fence present, or numbered bold bullets that smell like items.
 * Used to show a visible "couldn't parse — ask me to resend" note instead of
 * silently rendering no chips.
 */
export function looksLikeUnparsedProposal(
	content: string,
	parsed: ParsedSuggestion[],
	canAccept: boolean
): boolean {
	if (!canAccept) return false;
	if (parsed.length > 0) return false;
	return /```/i.test(content) || /^\s*\d+\.\s+\*\*/m.test(content);
}

/**
 * Serialize current plan items into a compact context header so the model has
 * real item_ids for update/delete suggestions without a get-trip-plan RPC call
 * every turn. Returns '' when there are no items.
 */
export function serializeCurrentPlan(items: unknown): string {
	if (!Array.isArray(items) || items.length === 0) return '';
	try {
		const compact = items
			.map((it: any) => {
				const id = it?.id ?? it?.item_id ?? it?.itemId;
				const parts = [
					id ? `#${id}` : '',
					`d${it?.day_number ?? it?.day ?? '?'}`,
					it?.title ?? '',
					it?.type ? `(${it.type})` : '',
					it?.start_time ?? it?.time ?? ''
				].filter(Boolean);
				return parts.join(' ');
			})
			.join(' | ');
		return compact ? `[CURRENT PLAN] ${compact}` : '';
	} catch {
		return '';
	}
}

/**
 * Whether a suggestion already matches an item in the current plan — so a
 * reloaded conversation can't double-add an item (create matches by title+day,
 * update/delete by item_id).
 */
export function isSuggestionAlreadyInPlan(sug: ParsedSuggestion, items: unknown): boolean {
	if (sug.target === 'navigate') return false;
	if (!Array.isArray(items) || items.length === 0) return false;
	try {
		if ((sug.action === 'update' || sug.action === 'delete') && sug.item_id) {
			return items.some((it: any) => (it?.id ?? it?.item_id) === sug.item_id);
		}
		const title = (sug.title ?? '').trim().toLowerCase();
		const day = sug.day;
		return items.some(
			(it: any) =>
				(it?.day_number ?? it?.day) === day &&
				String(it?.title ?? '')
					.trim()
					.toLowerCase() === title
		);
	} catch {
		return false;
	}
}
