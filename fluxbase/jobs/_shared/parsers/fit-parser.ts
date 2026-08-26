/**
 * FIT Streaming Parser
 *
 * Imports Garmin FIT activity files. GPS records stream into tracker_data in
 * batches (like the other import parsers); after the session message has been
 * decoded the imported points are tagged with the resolved sport and, when the
 * user has the fitness beta enabled, the session summary and per-point metrics
 * are written to fitness_activities / fitness_records.
 */

import {
  decodeFitStream,
  resolveSportTag,
  type FitFileId,
  type FitRecord,
  type FitSession
} from './fit-decoder.ts';

import {
  type ImportPoint,
  type ParseResult,
  type ErrorSummary,
  safeReportProgress,
  processPointBatch,
  mergeErrorSummaries,
  logErrorSummary
} from '../utils/import-helpers.ts';

import type { FluxbaseClient, JobUtils } from '../../types.d.ts';

const BATCH_SIZE = 240;
const TRACKER_TYPE = 'import';
const IMPORT_SOURCE = 'fit';

/** Well-known manufacturer ids get a readable name; others are stored as numbers. */
const MANUFACTURER_NAMES: Record<number, string> = {
  1: 'garmin',
  15: 'fitbit',
  32: 'polar',
  33: 'apple',
  47: 'wahoo',
  76: 'zwift',
  96: 'coros',
  255: 'bryton',
  267: 'bryton'
};

interface FitnessMetricRow {
  recorded_at: string;
  heart_rate: number | null;
  cadence: number | null;
  power: number | null;
  temperature: number | null;
  cumulative_distance_m: number | null;
}

/**
 * Parse a FIT stream and import points to the database
 */
export async function parseStream(
  stream: ReadableStream<Uint8Array>,
  totalBytes: number,
  userId: string,
  fluxbase: FluxbaseClient,
  job: JobUtils,
  startTime: number,
  fileName: string
): Promise<ParseResult> {
  let importedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let duplicatesCount = 0;
  let alreadyExistsCount = 0;
  const errorSummary: ErrorSummary = { counts: {}, samples: [] };

  let pointBuffer: ImportPoint[] = [];
  let metricRows = new Map<string, FitnessMetricRow>();
  let processedPointCount = 0;
  let lastLogTime = startTime;

  const sessions: FitSession[] = [];
  let fileId: FitFileId | null = null;
  let firstRecordAt: string | null = null;
  let lastRecordAt: string | null = null;
  let sawPower = false;
  let sawCadence = false;

  console.log(`Streaming FIT: Processing points in batches of ${BATCH_SIZE}`);

  const processBatch = async () => {
    if (pointBuffer.length === 0) return;

    const batch = pointBuffer.slice(0, BATCH_SIZE);
    pointBuffer = pointBuffer.slice(BATCH_SIZE);

    const result = await processPointBatch(
      batch,
      userId,
      processedPointCount,
      fluxbase,
      fileName,
      TRACKER_TYPE,
      IMPORT_SOURCE
    );
    processedPointCount += batch.length;

    importedCount += result.imported;
    skippedCount += result.skipped;
    errorCount += result.errors;
    duplicatesCount += result.duplicates;
    alreadyExistsCount += result.alreadyExists;
    mergeErrorSummaries(errorSummary, result.errorSummary);
  };

  const reportProgress = (bytesRead: number) => {
    const currentTime = Date.now();
    if (currentTime - lastLogTime < 5000) return;
    const progress = totalBytes > 0 ? Math.round((bytesRead / totalBytes) * 100) : 0;
    const elapsedSeconds = (currentTime - startTime) / 1000;
    const rate = processedPointCount > 0 ? (processedPointCount / elapsedSeconds).toFixed(1) : '0';

    console.log(
      `Progress: ${progress}% - Points: ${processedPointCount.toLocaleString()} - Rate: ${rate}/sec - Imported: ${importedCount.toLocaleString()}`
    );
    safeReportProgress(
      job,
      progress,
      `Streaming FIT... ${progress}% - ${processedPointCount.toLocaleString()} points - ${rate}/sec`
    );
    lastLogTime = currentTime;
  };

  // Decode the binary stream; GPS records become ImportPoints, sensor
  // metrics are kept for the fitness tables once the session is known.
  const decodeResult = await decodeFitStream(stream, {
    onFileId: (f) => {
      fileId = f;
    },
    onSession: (s) => {
      sessions.push(s);
    },
    onRecord: (r: FitRecord) => {
      if (!r.timestamp) return;

      if (firstRecordAt === null) firstRecordAt = r.timestamp;
      lastRecordAt = r.timestamp;

      if (
        r.heartRate !== undefined ||
        r.cadence !== undefined ||
        r.power !== undefined ||
        r.temperatureC !== undefined ||
        r.distanceM !== undefined
      ) {
        if (!metricRows.has(r.timestamp)) {
          metricRows.set(r.timestamp, {
            recorded_at: r.timestamp,
            heart_rate: r.heartRate ?? null,
            cadence: r.cadence ?? null,
            power: r.power ?? null,
            temperature: r.temperatureC ?? null,
            cumulative_distance_m: r.distanceM ?? null
          });
        }
        if (r.power !== undefined && r.power > 0) sawPower = true;
        if (r.cadence !== undefined && r.cadence > 0) sawCadence = true;
      }

      if (r.positionLat === undefined || r.positionLon === undefined) return;

      pointBuffer.push({
        lat: r.positionLat,
        lon: r.positionLon,
        ele: r.altitudeM,
        time: r.timestamp,
        speed: r.speedMs,
        heading: r.headingDeg,
        extendedData: { fitness: true }
      });
    },
    onProgress: reportProgress,
    onDrain: async () => {
      while (pointBuffer.length >= BATCH_SIZE) {
        await processBatch();
      }
    }
  });

  // Process remaining points
  while (pointBuffer.length > 0) {
    await processBatch();
  }

  for (const warning of decodeResult.warnings) {
    console.warn(`FIT decoder warning: ${warning}`);
  }
  console.log(
    `FIT decoded: ${decodeResult.messageCount.toLocaleString()} messages, ${decodeResult.recordCount.toLocaleString()} records, ${sessions.length} session(s)`
  );

  // Pick the summary session (largest distance, falling back to the last one)
  const session = sessions.length
    ? sessions.reduce((best, s) =>
        (s.totalDistanceM ?? -1) > (best.totalDistanceM ?? -1) ? s : best
      )
    : null;

  // The sport is only known after the session message (end of file), so the
  // imported tracker_data points are tagged in one range update.
  const sportTag = resolveSportTag(session, sawPower, sawCadence);
  if (importedCount > 0 && firstRecordAt && lastRecordAt) {
    try {
      const { error: tagError } = await fluxbase
        .from('tracker_data')
        .update({ activity_type: sportTag })
        .eq('user_id', userId)
        .eq('tracker_type', TRACKER_TYPE)
        .is('activity_type', null)
        .gte('recorded_at', firstRecordAt)
        .lte('recorded_at', lastRecordAt)
        .contains('geocode', { properties: { import_source: IMPORT_SOURCE } });
      if (tagError) {
        console.warn(`Failed to tag imported points as ${sportTag}: ${tagError.message}`);
      } else {
        console.log(`Tagged imported points as '${sportTag}'`);
      }
    } catch (tagFailure) {
      console.warn(`Error tagging imported points:`, tagFailure);
    }
  }

  // Fitness tables (beta opt-in only)
  if (metricRows.size > 0 && firstRecordAt && lastRecordAt) {
    await importFitnessData(
      fluxbase,
      userId,
      fileName,
      session,
      fileId,
      sportTag,
      metricRows,
      firstRecordAt,
      lastRecordAt
    );
  }

  safeReportProgress(
    job,
    100,
    `Import complete - ${processedPointCount.toLocaleString()} points processed`
  );
  console.log(`Streaming complete: ${processedPointCount.toLocaleString()} total points parsed`);

  logErrorSummary(errorSummary);

  return { importedCount, skippedCount, errorCount, duplicatesCount, alreadyExistsCount };
}

/**
 * Write the session summary and per-point metrics to the fitness tables when
 * the user has opted in to the fitness beta. No-op (with a log line) otherwise.
 */
async function importFitnessData(
  fluxbase: FluxbaseClient,
  userId: string,
  fileName: string,
  session: FitSession | null,
  fileId: FitFileId | null,
  sportTag: string,
  metricRows: Map<string, FitnessMetricRow>,
  firstRecordAt: string,
  lastRecordAt: string
): Promise<void> {
  let betaEnabled = false;
  try {
    const { data: prefs, error: prefsError } = await fluxbase
      .from('user_preferences')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle();
    if (prefsError) {
      console.warn(`Could not read user preferences: ${prefsError.message}`);
    } else {
      betaEnabled = (prefs?.preferences as any)?.beta_features?.fitness === true;
    }
  } catch (prefsFailure) {
    console.warn(`Error reading user preferences:`, prefsFailure);
  }

  if (!betaEnabled) {
    console.log(
      'Fitness beta not enabled for this user; skipping fitness tables (GPS points only)'
    );
    return;
  }

  const startedAt = session?.startTime ?? firstRecordAt;
  let endedAt = lastRecordAt;
  if (session?.totalElapsedTimeS !== undefined) {
    endedAt = new Date(
      new Date(startedAt).getTime() + session.totalElapsedTimeS * 1000
    ).toISOString();
  }

  // Re-import dedupe: one activity per (user, start time)
  const { data: existing } = await fluxbase
    .from('fitness_activities')
    .select('id')
    .eq('user_id', userId)
    .eq('started_at', startedAt)
    .maybeSingle();
  if (existing) {
    console.log(`Fitness activity for start ${startedAt} already exists; skipping fitness tables`);
    return;
  }

  const maxDistance = metricRows.size
    ? Math.max(0, ...Array.from(metricRows.values(), (r) => r.cumulative_distance_m ?? 0))
    : 0;

  const activity = {
    user_id: userId,
    sport: sportTag,
    sub_sport: session?.subSport ?? null,
    started_at: startedAt,
    ended_at: endedAt,
    total_distance_m: session?.totalDistanceM ?? (maxDistance > 0 ? maxDistance : null),
    elapsed_time_s: session?.totalElapsedTimeS ?? null,
    moving_time_s: session?.totalTimerTimeS ?? null,
    avg_heartrate: session?.avgHeartRate ?? null,
    max_heartrate: session?.maxHeartRate ?? null,
    avg_power: session?.avgPower ?? null,
    max_power: session?.maxPower ?? null,
    avg_cadence: session?.avgCadence ?? null,
    calories: session?.totalCalories ?? null,
    manufacturer:
      fileId?.manufacturer !== undefined
        ? (MANUFACTURER_NAMES[fileId.manufacturer] ?? String(fileId.manufacturer))
        : null,
    product: fileId?.product !== undefined ? String(fileId.product) : null,
    serial_number: fileId?.serialNumber !== undefined ? String(fileId.serialNumber) : null,
    source_file: fileName
  };

  const { data: inserted, error: activityError } = await fluxbase
    .from('fitness_activities')
    .insert(activity)
    .select('id')
    .single();

  if (activityError || !inserted) {
    console.warn(`Failed to insert fitness activity: ${activityError?.message}`);
    return;
  }
  console.log(
    `Created fitness activity ${inserted.id} (${sportTag}, ${metricRows.size} metric rows)`
  );

  const rows = Array.from(metricRows.values()).map((row) => ({
    ...row,
    activity_id: inserted.id as string,
    user_id: userId
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error: recordsError } = await fluxbase.from('fitness_records').insert(chunk);
    if (recordsError) {
      console.warn(
        `Failed to insert fitness records batch ${i / BATCH_SIZE + 1}: ${recordsError.message}`
      );
      break;
    }
  }
}
