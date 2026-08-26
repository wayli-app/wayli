/**
 * FIT decoder unit tests
 *
 * Runs against a real activity file placed at the repo root
 * (260816195715.fit, a Bryton cycling ride). The file is personal data and is
 * git-ignored; the tests skip cleanly when it is not present.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	decodeFitStream,
	recordSpeedToKmh,
	resolveSportTag,
	type FitFileId,
	type FitRecord,
	type FitSession
} from '../../../fluxbase/jobs/_shared/parsers/fit-decoder';

// Tests run from web/ via `bun run test:unit`; the fixture lives at the repo root.
const FIT_FILE = resolve(process.cwd(), '../260816195715.fit');
const fileAvailable = existsSync(FIT_FILE);

describe('recordSpeedToKmh unit correction', () => {
	it('passes km/h record speeds from affected manufacturers through', () => {
		// Bryton (255/267) writes the record speed field in km/h already.
		expect(recordSpeedToKmh(267, 32.2)).toBe(32.2);
		expect(recordSpeedToKmh(255, 36)).toBe(36);
	});

	it('converts standard m/s record speeds to the km/h column convention', () => {
		// Garmin (1) and unknown manufacturers follow the FIT profile (m/s).
		expect(recordSpeedToKmh(1, 8.94)).toBeCloseTo(32.18, 2);
		expect(recordSpeedToKmh(undefined, 10)).toBeCloseTo(36, 2);
	});
});

function streamFromFile(path: string, chunkSize = 4096): ReadableStream<Uint8Array> {
	const bytes = new Uint8Array(readFileSync(path));
	let position = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (position >= bytes.length) {
				controller.close();
				return;
			}
			const end = Math.min(position + chunkSize, bytes.length);
			controller.enqueue(bytes.slice(position, end));
			position = end;
		}
	});
}

async function decodeFixture(chunkSize?: number) {
	const records: FitRecord[] = [];
	const sessions: FitSession[] = [];
	const fileIds: FitFileId[] = [];
	const result = await decodeFitStream(streamFromFile(FIT_FILE, chunkSize), {
		onRecord: (r) => records.push(r),
		onSession: (s) => sessions.push(s),
		onFileId: (f) => fileIds.push(f)
	});
	return { result, records, sessions, fileIds };
}

describe.skipIf(!fileAvailable)('fit-decoder (real Bryton activity file)', () => {
	it('decodes the file header', async () => {
		const { result } = await decodeFixture();
		expect(result.protocolVersion).toBe(0x10); // protocol 1.0
		expect(result.profileVersion).toBe(1010);
		expect(result.dataSize).toBe(158447);
		expect(result.totalBytes).toBe(158463);
	});

	it('decodes file_id with Bryton device info', async () => {
		const { fileIds } = await decodeFixture();
		expect(fileIds).toHaveLength(1);
		expect(fileIds[0].type).toBe(4); // activity
		expect(fileIds[0].manufacturer).toBe(267); // Bryton
		expect(fileIds[0].product).toBe(2101);
		expect(fileIds[0].serialNumber).toBe(5122);
		expect(fileIds[0].timeCreated).toBe('2026-08-16T17:57:14.000Z');
	});

	it('decodes all 4139 records with GPS', async () => {
		const { records } = await decodeFixture();
		expect(records).toHaveLength(4139);

		const withPosition = records.filter((r) => r.positionLat !== undefined);
		expect(withPosition.length).toBe(4139);

		const first = records[0];
		expect(first.timestamp).toBe('2026-08-16T17:57:40.000Z');
		expect(first.positionLat).toBeCloseTo(52.429106, 4);
		expect(first.positionLon).toBeCloseTo(5.0445, 3);

		const last = records[records.length - 1];
		expect(last.timestamp).toBe('2026-08-16T19:07:58.000Z');

		const lats = records.map((r) => r.positionLat!);
		const lons = records.map((r) => r.positionLon!);
		expect(Math.min(...lats)).toBeCloseTo(52.3813, 3);
		expect(Math.max(...lats)).toBeCloseTo(52.46498, 3);
		expect(Math.min(...lons)).toBeCloseTo(4.90573, 3);
		expect(Math.max(...lons)).toBeCloseTo(5.13736, 3);
	});

	it('decodes heart rate, power, and cadence ranges', async () => {
		const { records } = await decodeFixture();
		const hr = records.map((r) => r.heartRate).filter((v): v is number => v !== undefined);
		const power = records.map((r) => r.power).filter((v): v is number => v !== undefined);
		const cadence = records.map((r) => r.cadence).filter((v): v is number => v !== undefined);

		expect(hr.length).toBeGreaterThan(3000);
		expect(Math.min(...hr)).toBe(117);
		expect(Math.max(...hr)).toBe(170);

		expect(power.length).toBeGreaterThan(3000);
		expect(Math.max(...power)).toBe(777);

		expect(cadence.length).toBeGreaterThan(3000);
	});

	it('decodes the session summary (with the Bryton sport quirk)', async () => {
		const { sessions } = await decodeFixture();
		expect(sessions).toHaveLength(1);
		const session = sessions[0];
		// This Bryton ride writes a bogus sport byte (9 = american_football);
		// the decoder stays faithful to the file, the parser remaps via
		// resolveSportTag (tested below).
		expect(session.sport).toBe('american_football');
		expect(session.totalDistanceM).toBeCloseTo(34245.34, 0);
		expect(session.totalElapsedTimeS).toBeCloseTo(4281.0, 1);
		expect(session.totalTimerTimeS).toBeCloseTo(4134.0, 1);
		expect(session.totalCalories).toBe(916);
		expect(session.avgSpeedMs).toBeCloseTo(8.283, 2);
		expect(session.maxSpeedMs).toBeCloseTo(10.876, 2);
		expect(session.avgHeartRate).toBe(153);
		expect(session.maxHeartRate).toBe(170);
		expect(session.avgCadence).toBe(87);
		expect(session.maxCadence).toBe(106);
		expect(session.avgPower).toBe(220);
		expect(session.maxPower).toBe(777);
		expect(session.startTime).toBe('2026-08-16T17:57:14.000Z');
	});

	it('resolves the sport tag from the data signature for anomalous sport bytes', async () => {
		const { sessions } = await decodeFixture();
		// Power + cadence data present → the american_football byte is quirk,
		// not truth; the ride resolves to cycling.
		expect(resolveSportTag(sessions[0], true, true)).toBe('cycling');
		// Plausible declared sports are kept as-is.
		expect(resolveSportTag({ sport: 'running' }, false, false)).toBe('running');
		expect(resolveSportTag({ sport: 'swimming' }, false, false)).toBe('swimming');
		// Implausible declared sport without riding sensors → generic fitness.
		expect(resolveSportTag({ sport: 'tennis' }, false, false)).toBe('fitness');
		// No session at all → inferred from speed.
		expect(resolveSportTag(null, false, false)).toBe('fitness');
		expect(resolveSportTag({ avgSpeedMs: 2.8 }, false, true)).toBe('running');
	});

	it('tolerates the mismatched CRCs with a warning instead of failing', async () => {
		const { result } = await decodeFixture();
		// The fixture was post-processed and carries stale CRCs.
		expect(result.crcOk).toBe(false);
		expect(result.warnings.some((w) => w.includes('CRC mismatch'))).toBe(true);
	});

	it('produces identical results for different chunk sizes', async () => {
		const full = await decodeFixture();
		const tiny = await decodeFixture(64);
		expect(tiny.records).toHaveLength(full.records.length);
		expect(tiny.records[0]).toEqual(full.records[0]);
		expect(tiny.records[4138]).toEqual(full.records[4138]);
	});

	it('rejects non-FIT data', async () => {
		const garbage = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([13, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5]));
				controller.close();
			}
		});
		await expect(decodeFitStream(garbage, {})).rejects.toThrow(/header size|FIT/i);
	});
});
