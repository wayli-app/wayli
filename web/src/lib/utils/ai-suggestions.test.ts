// Unit tests for the AI suggestion-parsing helpers (ai-suggestions.ts).
// Covers the model-output contract that the plan-mode write path depends on:
// fenced/unfenced JSON, tolerant fixups for common LLM quirks, typed nav-link
// chips, the current-plan serializer, and the "looks like an unparseable
// proposal" heuristic that drives the visible parse-failed note.

import { describe, it, expect } from 'vitest';
import {
	safeJsonArrayParse,
	extractNavLinks,
	extractSuggestions,
	looksLikeUnparsedProposal,
	serializeCurrentPlan,
	isSuggestionAlreadyInPlan
} from './ai-suggestions';

// Module-level fallback for the bullet-parser test path. Declared here (not in
// the describe block) so oxlint's consistent-function-scoping rule is satisfied.
const bulletFallback = (c: string) => [{ day: 1, title: c.slice(0, 3) }];

describe('safeJsonArrayParse', () => {
	it('parses a well-formed JSON array', () => {
		const out = safeJsonArrayParse('[{"day":1,"title":"Museum"}]');
		expect(out).toHaveLength(1);
		expect(out![0].title).toBe('Museum');
	});

	it('returns null for an empty array', () => {
		expect(safeJsonArrayParse('[]')).toBeNull();
	});

	it('returns null for a non-array', () => {
		expect(safeJsonArrayParse('{"a":1}')).toBeNull();
		expect(safeJsonArrayParse('"text"')).toBeNull();
	});

	it('tolerates trailing commas before } and ]', () => {
		const out = safeJsonArrayParse('[{"day":1,"title":"A",},]');
		expect(out).toHaveLength(1);
		expect(out![0].title).toBe('A');
	});

	it('tolerates single-quoted keys and values', () => {
		const out = safeJsonArrayParse("[{'day':1,'title':'A'}]");
		expect(out).toHaveLength(1);
		expect(out![0].title).toBe('A');
	});

	it('returns null for genuinely broken input', () => {
		expect(safeJsonArrayParse('[this is not json')).toBeNull();
	});
});

describe('extractNavLinks', () => {
	it('parses a trip link', () => {
		const out = extractNavLinks('See [trip:abc-123|Berlin trip] for details.');
		expect(out).toHaveLength(1);
		expect(out[0].target).toBe('navigate');
		expect(out[0].href).toBe('/dashboard/travel?trip=abc-123');
		expect(out[0].title).toBe('Berlin trip');
	});

	it('parses a place link', () => {
		const out = extractNavLinks('[place:52.5,13.4|Brandenburg Gate]');
		expect(out).toHaveLength(1);
		expect(out[0].href).toBe('/dashboard/location-data?lat=52.5&lng=13.4');
	});

	it('parses a trip-plan link', () => {
		const out = extractNavLinks('[trip-plan:abc|Plan this trip]');
		expect(out).toHaveLength(1);
		expect(out[0].href).toBe('/dashboard/travel/abc/plan');
	});

	it('parses multiple links and is case-insensitive', () => {
		const out = extractNavLinks('[TRIP:a|x] and [place:1,2|y]');
		expect(out).toHaveLength(2);
	});

	it('ignores malformed brackets', () => {
		expect(extractNavLinks('[trip:nopipe]')).toHaveLength(0);
		expect(extractNavLinks('plain text')).toHaveLength(0);
	});
});

describe('extractSuggestions', () => {
	it('extracts from a ```json fenced block', () => {
		const content = 'Here:\n\n```json\n[{"day":1,"title":"A"}]\n```';
		const out = extractSuggestions(content);
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe('A');
	});

	it('extracts from a fence without the json tag', () => {
		const content = '```\n[{"day":1,"title":"A"}]\n```';
		expect(extractSuggestions(content)).toHaveLength(1);
	});

	it('takes the LAST raw JSON array when unfenced (avoids matching prose [1,2])', () => {
		const content = 'Numbers [1, 2] mean nothing.\n\n[{"day":2,"title":"B"}]';
		const out = extractSuggestions(content);
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe('B');
	});

	it('falls back to nav links when no JSON array is present', () => {
		const content = 'Open [trip:abc|My trip].';
		const out = extractSuggestions(content);
		expect(out).toHaveLength(1);
		expect(out[0].target).toBe('navigate');
	});

	it('falls back to the provided bullet parser', () => {
		const out = extractSuggestions('no json here', bulletFallback);
		expect(out).toHaveLength(1);
	});

	it('returns [] when nothing parses and no fallback', () => {
		expect(extractSuggestions('just prose')).toEqual([]);
	});

	it('tolerates trailing commas in the fenced JSON', () => {
		const content = '```json\n[{"day":1,"title":"A",},]\n```';
		expect(extractSuggestions(content)).toHaveLength(1);
	});

	it('parses trip-composition suggestions (target: trip, approve/reject/create)', () => {
		const content = `Here are your pending suggestions:

\`\`\`json
[
  {"target":"trip","action":"approve","item_id":"abc","day":0,"title":"Detected Berlin"},
  {"target":"trip","action":"reject","item_id":"def","day":0,"title":"Detected Rome"}
]
\`\`\``;
		const out = extractSuggestions(content);
		expect(out).toHaveLength(2);
		expect(out[0].target).toBe('trip');
		expect(out[0].action).toBe('approve');
		expect(out[0].item_id).toBe('abc');
		expect(out[1].action).toBe('reject');
	});

	it('parses a trip-create suggestion with date fields', () => {
		const content =
			'```json\n[{"target":"trip","action":"create","day":0,"title":"Lisbon","start_date":"2024-10-10","end_date":"2024-10-14","primary_city":"Lisbon"}]\n```';
		const out = extractSuggestions(content);
		expect(out).toHaveLength(1);
		expect(out[0].target).toBe('trip');
		expect(out[0].start_date).toBe('2024-10-10');
		expect(out[0].end_date).toBe('2024-10-14');
	});
});

describe('looksLikeUnparsedProposal', () => {
	it('is true when a fence is present but parsing yielded nothing', () => {
		expect(looksLikeUnparsedProposal('```\nbroken\n```', [], true)).toBe(true);
	});

	it('is true when numbered bold bullets are present with no parse', () => {
		expect(looksLikeUnparsedProposal('1. **Museum**\n2. **Park**', [], true)).toBe(true);
	});

	it('is false when suggestions parsed successfully', () => {
		expect(
			looksLikeUnparsedProposal('```json\n[{"day":1}]\n```', [{ day: 1, title: 'x' }], true)
		).toBe(false);
	});

	it('is false when not in a context that accepts suggestions', () => {
		expect(looksLikeUnparsedProposal('```\nbroken\n```', [], false)).toBe(false);
	});
});

describe('serializeCurrentPlan', () => {
	it('serializes items with id, day, title, type, time', () => {
		const out = serializeCurrentPlan([
			{ id: 'i1', day_number: 1, title: 'Museum', type: 'sightseeing', start_time: '10:00' }
		]);
		expect(out).toBe('[CURRENT PLAN] #i1 d1 Museum (sightseeing) 10:00');
	});

	it('handles alt key shapes (item_id, day, time)', () => {
		const out = serializeCurrentPlan([{ item_id: 'i2', day: 3, title: 'Lunch', time: '13:00' }]);
		expect(out).toBe('[CURRENT PLAN] #i2 d3 Lunch 13:00');
	});

	it('returns empty string for an empty/missing plan', () => {
		expect(serializeCurrentPlan([])).toBe('');
		expect(serializeCurrentPlan(undefined)).toBe('');
		expect(serializeCurrentPlan(null)).toBe('');
	});
});

describe('isSuggestionAlreadyInPlan', () => {
	const plan = [
		{ id: 'i1', day_number: 1, title: 'Museum' },
		{ id: 'i2', day_number: 2, title: 'Lunch' }
	];

	it('matches a create suggestion by title + day', () => {
		expect(isSuggestionAlreadyInPlan({ day: 1, title: 'Museum', action: 'create' }, plan)).toBe(
			true
		);
		expect(isSuggestionAlreadyInPlan({ day: 1, title: 'Different', action: 'create' }, plan)).toBe(
			false
		);
	});

	it('is case-insensitive on title and trims whitespace', () => {
		expect(isSuggestionAlreadyInPlan({ day: 2, title: '  lunch  ', action: 'create' }, plan)).toBe(
			true
		);
	});

	it('matches update/delete by item_id', () => {
		expect(
			isSuggestionAlreadyInPlan({ day: 0, title: 'x', action: 'update', item_id: 'i1' }, plan)
		).toBe(true);
		expect(
			isSuggestionAlreadyInPlan({ day: 0, title: 'x', action: 'delete', item_id: 'nope' }, plan)
		).toBe(false);
	});

	it('ignores navigate suggestions', () => {
		expect(
			isSuggestionAlreadyInPlan({ day: 0, title: 'x', target: 'navigate', href: '/x' }, plan)
		).toBe(false);
	});

	it('returns false when the plan is empty', () => {
		expect(isSuggestionAlreadyInPlan({ day: 1, title: 'Museum' }, [])).toBe(false);
	});
});
