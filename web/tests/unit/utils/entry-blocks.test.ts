import { describe, it, expect } from 'vitest';
import {
	blocksFromLegacy,
	legacyBodyFromBlocks,
	effectiveBlocks,
	normalizeEntryBlocks,
	type BlockMedia
} from '$lib/utils/entry-blocks';

const media = (id: string, path: string): BlockMedia => ({ id, storage_path: path, caption: '' });

const M1 = media('id-1', 'entries/p1.jpg');
const M2 = media('id-2', 'entries/p2.jpg');
const M3 = media('id-3', 'entries/p3.jpg');

describe('blocksFromLegacy', () => {
	it('derives a single text block from a plain body', () => {
		expect(blocksFromLegacy('Just text.', [])).toEqual({
			v: 1,
			blocks: [{ t: 'text', md: 'Just text.' }]
		});
	});

	it('splits text around inline tokens and groups adjacent tokens', () => {
		const body =
			'First paragraph.\n\n![photo](wayli-media:entries/p1.jpg)\n\n![photo](wayli-media:entries/p2.jpg)\n\nClosing text.';
		expect(blocksFromLegacy(body, [M1, M2, M3])).toEqual({
			v: 1,
			blocks: [
				{ t: 'text', md: 'First paragraph.' },
				{ t: 'photos', ids: ['id-1', 'id-2'] },
				{ t: 'text', md: 'Closing text.' },
				{ t: 'photos', ids: ['id-3'] }
			]
		});
	});

	it('keeps unresolvable tokens as literal text (no data loss)', () => {
		const body = 'Text before.\n\n![photo](wayli-media:entries/missing.jpg)\n\nText after.';
		expect(blocksFromLegacy(body, [])).toEqual({
			v: 1,
			blocks: [
				{ t: 'text', md: 'Text before.' },
				{ t: 'text', md: '![photo](wayli-media:entries/missing.jpg)\n\nText after.' }
			]
		});
	});

	it('appends unreferenced media as a trailing photo block', () => {
		expect(blocksFromLegacy('', [M1, M2])).toEqual({
			v: 1,
			blocks: [{ t: 'photos', ids: ['id-1', 'id-2'] }]
		});
	});

	it('returns null when there is no content', () => {
		expect(blocksFromLegacy('', [])).toBeNull();
		expect(blocksFromLegacy('  \n\n ', [])).toBeNull();
		expect(blocksFromLegacy(null, [])).toBeNull();
	});

	it('decodes percent-encoded refs when matching media', () => {
		const body = '![photo](wayli-media:entries/with%20space.jpg)';
		const m = media('id-x', 'entries/with space.jpg');
		expect(blocksFromLegacy(body, [m])).toEqual({
			v: 1,
			blocks: [{ t: 'photos', ids: ['id-x'] }]
		});
	});
});

describe('legacyBodyFromBlocks', () => {
	it('projects text and photo blocks to the token format', () => {
		const byId = new Map([
			['id-1', M1],
			['id-2', M2]
		]);
		const blocks = [
			{ t: 'text', md: 'First paragraph.' },
			{ t: 'photos', ids: ['id-1', 'id-2'] },
			{ t: 'text', md: 'Closing text.' }
		] as const;
		expect(legacyBodyFromBlocks([...blocks], byId)).toBe(
			[
				'First paragraph.',
				'![photo](wayli-media:entries/p1.jpg)\n\n![photo](wayli-media:entries/p2.jpg)',
				'Closing text.'
			].join('\n\n')
		);
	});

	it('skips media ids missing from the map', () => {
		const blocks: import('$lib/types/journal.types').EntryBlock[] = [
			{ t: 'photos', ids: ['gone', 'id-1'] }
		];
		expect(legacyBodyFromBlocks(blocks, new Map([['id-1', M1]]))).toBe(
			'![photo](wayli-media:entries/p1.jpg)'
		);
	});

	it('round-trips a derived body through project → derive', () => {
		const body =
			'Intro.\n\n![photo](wayli-media:entries/p1.jpg)\n\n![photo](wayli-media:entries/p2.jpg)\n\nOutro.';
		const derived = blocksFromLegacy(body, [M1, M2])!;
		const projected = legacyBodyFromBlocks(
			derived.blocks,
			new Map([
				[M1.id, M1],
				[M2.id, M2]
			])
		);
		expect(projected).toBe(body);
	});
});

describe('effectiveBlocks', () => {
	it('uses stored blocks when the body projection matches', () => {
		const blocks = { v: 1, blocks: [{ t: 'text', md: 'Hi' }] };
		const body = 'Hi';
		expect(effectiveBlocks({ body, blocks }, [])).toEqual(blocks.blocks);
	});

	it('re-derives when a legacy client rewrote the body', () => {
		const blocks = { v: 1, blocks: [{ t: 'text', md: 'Old text' }] };
		const body = 'New text';
		expect(effectiveBlocks({ body, blocks }, [])).toEqual([{ t: 'text', md: 'New text' }]);
	});

	it('derives when blocks are missing', () => {
		expect(effectiveBlocks({ body: 'Legacy', blocks: null }, [])).toEqual([
			{ t: 'text', md: 'Legacy' }
		]);
	});
});

describe('normalizeEntryBlocks', () => {
	it('accepts valid v1 payloads', () => {
		expect(
			normalizeEntryBlocks({
				v: 1,
				blocks: [
					{ t: 'text', md: 'x' },
					{ t: 'photos', ids: ['a'] }
				]
			})
		).toEqual({
			v: 1,
			blocks: [
				{ t: 'text', md: 'x' },
				{ t: 'photos', ids: ['a'] }
			]
		});
	});

	it('rejects unknown versions and malformed shapes', () => {
		expect(normalizeEntryBlocks(null)).toBeNull();
		expect(normalizeEntryBlocks({ v: 2, blocks: [] })).toBeNull();
		expect(normalizeEntryBlocks({ v: 1 })).toBeNull();
		expect(normalizeEntryBlocks({ v: 1, blocks: [{ t: 'bogus' }] })).toBeNull();
	});

	it('drops malformed blocks but keeps valid ones', () => {
		expect(
			normalizeEntryBlocks({
				v: 1,
				blocks: [{ t: 'text', md: 'keep' }, { t: 'photos', ids: [42] }, 'junk']
			})
		).toEqual({ v: 1, blocks: [{ t: 'text', md: 'keep' }] });
	});
});
