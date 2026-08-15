import { describe, test, expect } from 'vitest';
import { modeFromEdges, matchedDistanceMeters } from './valhalla-mapping';
import type { ValhallaEdge } from './valhalla.service';

const edge = (overrides: Partial<ValhallaEdge> = {}): ValhallaEdge => ({
	road_class: 'residential',
	use: 'road',
	rail: false,
	speed: 50,
	length: 1,
	...overrides
});

describe('modeFromEdges', () => {
	test('majority rail edges → train (definitive)', () => {
		const edges = [
			edge({ rail: true, length: 8, use: 'road', road_class: 'primary' }),
			edge({ rail: true, length: 6 }),
			edge({ rail: false, length: 2 }) // small non-rail portion
		];
		const verdict = modeFromEdges(edges);
		expect(verdict?.mode).toBe('train');
		expect(verdict?.confidence).toBe(0.95);
		expect(verdict?.evidence).toBe('valhalla_rail_edge');
	});

	test('majority cycleway use → cycling', () => {
		const edges = [
			edge({ use: 'cycleway', length: 3 }),
			edge({ use: 'cycleway', length: 2 }),
			edge({ use: 'road', length: 1 })
		];
		const verdict = modeFromEdges(edges);
		expect(verdict?.mode).toBe('cycling');
		expect(verdict?.evidence).toBe('valhalla_cycleway_edge');
	});

	test('majority footway/steps/path use → walking', () => {
		const edges = [
			edge({ use: 'footway', length: 2 }),
			edge({ use: 'steps', length: 1 }),
			edge({ use: 'road', length: 1 })
		];
		const verdict = modeFromEdges(edges);
		expect(verdict?.mode).toBe('walking');
		expect(verdict?.evidence).toBe('valhalla_footway_edge');
	});

	test('motorway + high speed → car', () => {
		const edges = [
			edge({ road_class: 'motorway', speed: 110, length: 10 }),
			edge({ road_class: 'trunk', speed: 90, length: 5 })
		];
		const verdict = modeFromEdges(edges);
		expect(verdict?.mode).toBe('car');
		expect(verdict?.evidence).toBe('valhalla_motorway_edge');
	});

	test('mixed residential roads with moderate speed → null (inconclusive)', () => {
		const edges = [
			edge({ road_class: 'residential', speed: 30 }),
			edge({ road_class: 'service_other', speed: 20 }),
			edge({ road_class: 'unclassified', speed: 40 })
		];
		expect(modeFromEdges(edges)).toBeNull();
	});

	test('empty edges → null', () => {
		expect(modeFromEdges([])).toBeNull();
	});

	test('longer edges outweigh many short ones (length weighting)', () => {
		// One 10km motorway vs five 100m driveways — motorway should win.
		const edges = [
			edge({ road_class: 'motorway', speed: 100, length: 10 }),
			...Array.from({ length: 5 }, () => edge({ use: 'driveway', length: 0.1, speed: 10 }))
		];
		const verdict = modeFromEdges(edges);
		expect(verdict?.mode).toBe('car');
	});

	test('missing length defaults to weight 1 per edge', () => {
		const edges = [
			edge({ rail: true, length: undefined as any }),
			edge({ rail: true, length: undefined as any }),
			edge({ rail: false, length: undefined as any })
		];
		const verdict = modeFromEdges(edges);
		expect(verdict?.mode).toBe('train');
	});

	test('names extracted from dominant edges', () => {
		const edges = [
			edge({ rail: true, length: 5, names: ['Amsterdam–Utrecht line'] }),
			edge({ rail: true, length: 3, names: ['Amsterdam–Utrecht line'] })
		];
		const verdict = modeFromEdges(edges);
		expect(verdict?.names).toContain('Amsterdam–Utrecht line');
	});
});

describe('matchedDistanceMeters', () => {
	test('sums edge lengths (km → meters)', () => {
		const edges = [edge({ length: 2.5 }), edge({ length: 1.5 }), edge({ length: undefined as any })];
		expect(matchedDistanceMeters(edges)).toBe(4000);
	});

	test('empty → 0', () => {
		expect(matchedDistanceMeters([])).toBe(0);
	});
});
