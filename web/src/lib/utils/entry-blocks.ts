/**
 * Entry block model — the source of truth for journal entry content.
 *
 * An entry is an ordered list of blocks: text (markdown) or photos (ordered
 * trip_media ids). The legacy single-string `body` is a *projection* of the
 * blocks (photo blocks become inline `wayli-media:` tokens at their
 * position) so old clients, search RPCs and feed excerpts keep working.
 *
 * This module mirrors the server-side derive
 * (`wayli_entry_blocks_for_entry`) so both platforms and the backfill agree
 * on how legacy bodies + media rows become blocks.
 */

import { mediaToken } from './inline-media';
import type { EntryBlock, EntryBlocks } from '$lib/types/journal.types';

/** The media fields the block helpers need. */
export interface BlockMedia {
	id: string;
	storage_path: string;
	caption?: string | null;
}

const MEDIA_TOKEN = /!\[([^\]]*)\]\(wayli-media:([^)\s]+)\)/g;

function decodeRef(ref: string): string {
	try {
		return decodeURIComponent(ref);
	} catch {
		return ref;
	}
}

/**
 * Derive blocks from a legacy body + the entry's media rows (ordered by
 * sort_order). Mirrors the SQL derive:
 *   - runs of tokens separated only by whitespace become ONE photo block;
 *   - token refs resolve to media ids by exact storage_path match;
 *   - unresolvable tokens stay as literal text (no data loss);
 *   - unreferenced media is appended as a trailing photo block.
 * Returns null when there is no content at all.
 */
export function blocksFromLegacy(
	body: string | null | undefined,
	media: BlockMedia[]
): EntryBlocks | null {
	const byPath = new Map<string, string>();
	for (const m of media) byPath.set(m.storage_path, m.id);

	const blocks: EntryBlock[] = [];
	let text = '';
	let ids: string[] = [];
	const remaining = media.map((m) => m.id);

	const flushPhotos = () => {
		if (ids.length > 0) {
			blocks.push({ t: 'photos', ids });
			ids = [];
		}
	};
	const flushText = () => {
		if (text.trim() !== '') blocks.push({ t: 'text', md: text.trim() });
		text = '';
	};

	const src = body ?? '';
	const parts = src.split(/(!\[[^\]]*\]\(wayli-media:[^)\s]+\))/g);
	for (const part of parts) {
		if (part === '') continue;
		const tokenMatch = /^!\[[^\]]*\]\(wayli-media:([^)\s]+)\)$/.exec(part);
		if (tokenMatch) {
			const id = byPath.get(decodeRef(tokenMatch[1]));
			if (id === undefined) {
				// Unresolvable ref: keep the token as literal text.
				text += part;
			} else {
				ids.push(id);
				const idx = remaining.indexOf(id);
				if (idx >= 0) remaining.splice(idx, 1);
			}
		} else if (part.trim() === '') {
			// Whitespace-only run between tokens: keeps the photo group open.
			text += part;
		} else {
			flushPhotos();
			text += part;
			flushText();
		}
	}
	flushPhotos();
	if (remaining.length > 0) blocks.push({ t: 'photos', ids: remaining });

	if (blocks.length === 0) return null;
	return { v: 1, blocks };
}

/**
 * Project blocks back to the legacy single-string body. Text blocks are
 * emitted verbatim (trimmed); photo blocks become consecutive inline tokens
 * at their position. Media rows missing from `mediaById` are skipped — their
 * ids dangle for the renderer to drop gracefully.
 */
export function legacyBodyFromBlocks(
	blocks: EntryBlock[] | EntryBlocks | null | undefined,
	mediaById: Map<string, BlockMedia>
): string {
	if (!blocks) return '';
	const list = Array.isArray(blocks) ? blocks : blocks.blocks;
	const out: string[] = [];
	for (const block of list) {
		if (block.t === 'text') {
			const md = block.md.trim();
			if (md) out.push(md);
		} else if (block.t === 'photos') {
			const tokens = block.ids
				.map((id) => mediaById.get(id))
				.filter((m): m is BlockMedia => !!m)
				.map((m) => mediaToken(m.storage_path, sanitizeCaption(m.caption)));
			if (tokens.length > 0) out.push(tokens.join('\n\n'));
		}
	}
	return out.join('\n\n');
}

/** Captions live inside `![…]` — strip characters that would break the token. */
function sanitizeCaption(caption?: string | null): string {
	const clean = (caption ?? '').replace(/[[\]]/g, '').trim();
	return clean || 'photo';
}

/**
 * The read-compat rule: use the stored blocks unless they are missing or
 * stale (a legacy client rewrote `body` after the blocks were written —
 * detected by re-projecting and comparing). Returns the effective block
 * list, deriving from the legacy representation when needed.
 */
export function effectiveBlocks(
	entry: { body?: string | null; blocks?: EntryBlocks | null },
	media: BlockMedia[]
): EntryBlock[] {
	const stored = entry.blocks;
	if (stored && stored.v === 1 && stored.blocks.length > 0) {
		const projected = legacyBodyFromBlocks(stored, mediaById(media));
		if (projected === (entry.body ?? '')) return stored.blocks;
		// Fall through: body was edited by a legacy client — re-derive.
	}
	return blocksFromLegacy(entry.body, media)?.blocks ?? [];
}

function mediaById(media: BlockMedia[]): Map<string, BlockMedia> {
	return new Map(media.map((m) => [m.id, m]));
}

/**
 * Defensive parse of the server's jsonb value: unknown versions or malformed
 * shapes yield null (callers then derive from body).
 */
export function normalizeEntryBlocks(raw: unknown): EntryBlocks | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as { v?: unknown; blocks?: unknown };
	if (obj.v !== 1 || !Array.isArray(obj.blocks)) return null;
	const blocks: EntryBlock[] = [];
	for (const b of obj.blocks) {
		if (!b || typeof b !== 'object') continue;
		const block = b as { t?: unknown; md?: unknown; ids?: unknown };
		if (block.t === 'text' && typeof block.md === 'string') {
			blocks.push({ t: 'text', md: block.md });
		} else if (block.t === 'photos' && Array.isArray(block.ids)) {
			const ids = block.ids.filter((id): id is string => typeof id === 'string');
			if (ids.length > 0) blocks.push({ t: 'photos', ids });
		}
	}
	if (blocks.length === 0) return null;
	return { v: 1, blocks };
}
