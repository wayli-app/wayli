/**
 * Unified Data Import Job
 *
 * Imports GPS data from various formats (GeoJSON, GPX, KML, OwnTracks, FIT).
 * Routes to format-specific streaming parsers based on the format parameter.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 1800
 * @fluxbase:memory 512
 * @fluxbase:allow-read true
 * @fluxbase:allow-env true
 */

import { parseStream as parseGeoJSON } from './_shared/parsers/geojson-parser.ts';
import { parseStream as parseFIT } from './_shared/parsers/fit-parser.ts';
import { parseStream as parseGPX } from './_shared/parsers/gpx-parser.ts';
import { parseStream as parseKML } from './_shared/parsers/kml-parser.ts';
import { parseStream as parseOwnTracks } from './_shared/parsers/owntracks-parser.ts';
import {
  detectForImport,
  fetchUserParams,
  writeReport
} from './_shared/services/duplicate-detection.service.ts';
import {
  safeReportProgress,
  waitForRpcCompletion,
  resetIncrementalWatermarks,
  type ParseResult
} from './_shared/utils/import-helpers.ts';

import type { FluxbaseClient, JobUtils } from './types';

interface DataImportPayload {
  storagePath: string;
  format: string;
  fileName: string;
}

/** Included in the job result when the import overlaps existing recordings. */
interface DuplicateFinding {
  report_id: string;
  section_count: number;
  recommended_remove_count: number;
}

type FormatParser = (
  stream: ReadableStream<Uint8Array>,
  totalBytes: number,
  userId: string,
  fluxbase: FluxbaseClient,
  job: JobUtils,
  startTime: number,
  fileName: string
) => Promise<ParseResult>;

const FORMAT_PARSERS: Record<string, FormatParser> = {
  geojson: parseGeoJSON,
  fit: parseFIT,
  gpx: parseGPX,
  kml: parseKML,
  owntracks: parseOwnTracks
};

const SUPPORTED_FORMATS = Object.keys(FORMAT_PARSERS);

export async function handler(
  _req: Request,
  fluxbase: FluxbaseClient,
  fluxbaseService: FluxbaseClient,
  job: JobUtils
) {
  const context = job.getJobContext();
  const payload = context.payload as DataImportPayload;
  const userId = context.user?.id;

  if (!userId) {
    return {
      success: false,
      error: 'No user context available'
    };
  }

  // Get format from payload
  const format = (payload.format || '').toLowerCase();
  if (!format || !SUPPORTED_FORMATS.includes(format)) {
    return {
      success: false,
      error: `Unsupported format: ${payload.format}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`
    };
  }

  const parser = FORMAT_PARSERS[format];

  try {
    console.log(`Starting ${format.toUpperCase()} import with streaming parsing...`);
    const storage = fluxbase.storage.from('temp-files') as any;

    // Download file with progress tracking
    let lastDownloadLog = 0;
    const { data: downloadData, error: downloadError } = await storage.downloadResumable(
      payload.storagePath,
      {
        chunkSize: 5 * 1024 * 1024, // 5MB chunks
        maxRetries: 3,
        onProgress: (progress: {
          loaded?: number;
          total?: number;
          percentage?: number;
          bytesPerSecond?: number;
          currentChunk?: number;
          totalChunks?: number;
        }) => {
          const now = Date.now();
          if (now - lastDownloadLog > 5000) {
            const mb = ((progress.loaded ?? 0) / 1024 / 1024).toFixed(1);
            const totalMb = ((progress.total ?? 0) / 1024 / 1024).toFixed(1);
            const speed = ((progress.bytesPerSecond ?? 0) / 1024 / 1024).toFixed(1);
            const pct = (progress.percentage ?? 0).toFixed(1);
            console.log(
              `Downloading: ${mb}/${totalMb} MB (${pct}%) - ${speed} MB/s - Chunk ${progress.currentChunk ?? '?'}/${progress.totalChunks ?? '?'}`
            );
            lastDownloadLog = now;
          }
        }
      }
    );

    if (downloadError || !downloadData) {
      throw new Error(`Failed to download file: ${JSON.stringify(downloadError)}`);
    }

    const stream: ReadableStream<Uint8Array> = downloadData.stream;
    const totalBytes = downloadData.size || 0;
    console.log(`File size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

    safeReportProgress(job, 0, `Streaming ${format.toUpperCase()} data...`);

    // One uuid per import run, stamped into every point's geocode.properties.
    // This is the session identity duplicate detection (#274) uses to compare
    // this file against everything already recorded.
    const importId = crypto.randomUUID();

    // Parse the file using the format-specific parser
    const startTime = Date.now();
    const results = await parser(
      stream,
      totalBytes,
      userId,
      fluxbase,
      job,
      startTime,
      payload.fileName,
      importId
    );

    // Log final stats
    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`${format.toUpperCase()} import completed!`);
    console.log(`Final stats:`);
    console.log(`   Imported: ${results.importedCount.toLocaleString()} points`);
    console.log(`   Skipped (invalid): ${results.skippedCount.toLocaleString()} points`);
    console.log(`   Duplicates (in batch): ${results.duplicatesCount.toLocaleString()} points`);
    console.log(`   Already exists: ${results.alreadyExistsCount.toLocaleString()} points`);
    console.log(`   Errors: ${results.errorCount.toLocaleString()} points`);
    console.log(`   Total time: ${totalTime.toFixed(1)}s`);
    console.log(`   Average rate: ${(results.importedCount / totalTime).toFixed(1)} points/sec`);

    // Post-import tasks (only if we imported something)
    if (results.importedCount > 0) {
      await runPostImportTasks(fluxbase, fluxbaseService, job, context, userId);
    }

    // Overlap detection (#274): never deletes anything — writes a reviewable
    // duplicate_reports row and reports it in the job result so the UI can
    // offer "Review duplicates". Best-effort: detection failure must not fail
    // the import.
    const duplicates =
      results.importedCount > 0
        ? await detectOverlappingRecordings(fluxbase, userId, importId, payload, job)
        : undefined;

    // Clean up: remove the uploaded file from storage
    await cleanupUploadedFile(fluxbase, payload.storagePath);

    return {
      success: true,
      result: {
        importedCount: results.importedCount,
        fileName: payload.fileName,
        format: format.toUpperCase(),
        duplicates
      }
    };
  } catch (error: unknown) {
    console.error(`Error in ${format.toUpperCase()} import job:`, error);
    throw error;
  }
}

/**
 * Run post-import tasks: distance calculation and reverse geocoding
 */
async function runPostImportTasks(
  fluxbase: FluxbaseClient,
  fluxbaseService: FluxbaseClient,
  job: JobUtils,
  context: any,
  userId: string
): Promise<void> {
  // Late-arriving/imported points must be seen by the incremental jobs.
  await resetIncrementalWatermarks(fluxbaseService, userId);

  // Trigger distance calculation RPC
  console.log(`Triggering distance calculation RPC for user ${userId}...`);
  try {
    const { data: rpcResult, error: rpcError } = await fluxbase.rpc.invoke(
      'calculate-distances-batch',
      {},
      {
        namespace: 'wayli',
        async: true // run asynchronously to avoid request timeout
      }
    );

    if (rpcError) {
      console.warn(`Failed to trigger distance calculation RPC: ${rpcError.message}`);
    } else {
      console.log(`Distance calculation RPC triggered: ${rpcResult || 'started'}`);

      // Wait for RPC job to complete
      const executionId = (rpcResult as any)?.execution_id || rpcResult;
      if (executionId) {
        await waitForRpcCompletion(fluxbase, executionId, job);
      }
    }
  } catch (distanceError) {
    console.warn(`Distance calculation trigger failed:`, distanceError);
    // Don't fail the import if distance calculation fails
  }

  // Queue reverse geocoding job
  console.log(`Queueing reverse geocoding job for user ${userId}...`);
  try {
    const onBehalfOf = context.user
      ? {
          user_id: context.user.id,
          user_email: context.user.email,
          user_role: context.user.role
        }
      : undefined;

    const { data: geocodeJob, error: geocodeError } = await fluxbaseService.jobs.submit(
      'reverse-geocoding',
      {},
      {
        namespace: 'wayli',
        priority: 4,
        onBehalfOf
      }
    );

    if (geocodeError) {
      console.warn(`Failed to queue reverse geocoding job: ${geocodeError.message}`);
    } else {
      console.log(`Reverse geocoding job queued: ${(geocodeJob as any)?.job_id || 'unknown'}`);
    }
  } catch (geocodeQueueError) {
    console.warn(`Error queueing reverse geocoding job:`, geocodeQueueError);
  }
}

/**
 * Overlap detection (#274): compares the freshly-imported session against
 * everything already recorded (live tracker feed, earlier imports) and stores
 * a reviewable duplicate_reports row when sections overlap. Detection is a
 * suggestion, not an action — the user reviews the report (import banner →
 * DuplicateReview modal) before the duplicate-cleanup job removes anything.
 */
async function detectOverlappingRecordings(
  fluxbase: FluxbaseClient,
  userId: string,
  importId: string,
  payload: DataImportPayload,
  job: JobUtils
): Promise<DuplicateFinding | undefined> {
  try {
    safeReportProgress(job, 95, 'Checking for overlapping recordings...');

    // The user's tuned thresholds (data editor → Find duplicates → detection
    // sensitivity) apply to import-time detection too; defaults until tuned.
    const params = await fetchUserParams(fluxbase, userId);
    const draft = await detectForImport(
      fluxbase,
      importId,
      {
        format: (payload.format || '').toUpperCase(),
        file_name: payload.fileName
      },
      params
    );
    if (!draft) return undefined;

    const reportId = await writeReport(fluxbase, userId, draft);
    console.log(
      `Overlapping recordings found: ${draft.summary.section_count} section(s), ` +
        `${draft.summary.recommended_remove_count} point(s) recommended for removal ` +
        `(report ${reportId})`
    );
    safeReportProgress(
      job,
      100,
      `Import complete — ${draft.summary.section_count} overlapping section(s) found`
    );

    return {
      report_id: reportId,
      section_count: draft.summary.section_count,
      recommended_remove_count: draft.summary.recommended_remove_count
    };
  } catch (err) {
    console.warn('Duplicate detection failed (import result unaffected):', err);
    return undefined;
  }
}

/**
 * Clean up the uploaded file from storage
 */
async function cleanupUploadedFile(fluxbase: FluxbaseClient, storagePath: string): Promise<void> {
  console.log(`Removing uploaded file from storage: ${storagePath}`);
  try {
    const { error: removeError } = await fluxbase.storage.from('temp-files').remove([storagePath]);

    if (removeError) {
      console.warn(`Failed to remove uploaded file: ${removeError.message}`);
    } else {
      console.log(`Uploaded file removed from storage`);
    }
  } catch (cleanupError) {
    console.warn(`Error removing uploaded file:`, cleanupError);
    // Don't fail the import if cleanup fails
  }
}
