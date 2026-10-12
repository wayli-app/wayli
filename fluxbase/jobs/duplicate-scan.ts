/**
 * Duplicate Scan Job
 *
 * User-initiated historical scan for overlapping recordings (#274), started
 * from the data editor ("Find duplicates"). Walks the user's recording
 * history in month windows, runs the find-duplicate-clusters RPC (scan mode:
 * import-vs-device and device-vs-device pairs) per window, and stores ONE
 * reviewable duplicate_reports row when sections were found.
 *
 * Detection only ever creates a report — deletion happens solely through the
 * duplicate-cleanup job after the user reviews it.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 1800
 * @fluxbase:allow-read true
 */

import {
  buildClusters,
  buildSummary,
  detectForRange,
  stitchClusters,
  DEFAULT_DUPLICATE_PARAMS,
  monthWindows,
  type DuplicateCluster,
  type DuplicateReportSource,
  type RawClusterRow
} from './_shared/services/duplicate-detection.service.ts';
import { safeReportProgress } from './_shared/utils/import-helpers.ts';

import type { FluxbaseClient, JobUtils } from './types';

interface DuplicateScanPayload {
  /** ISO dates (yyyy-mm-dd). Absent = scan the user's full history. */
  start_date?: string;
  end_date?: string;
}

export async function handler(
  _req: Request,
  fluxbase: FluxbaseClient,
  _fluxbaseService: FluxbaseClient,
  job: JobUtils
) {
  const context = job.getJobContext();
  const payload = (context.payload ?? {}) as DuplicateScanPayload;
  const userId = context.user?.id;

  if (!userId) {
    return { success: false, error: 'No user context available' };
  }

  // Span to scan: the requested range, or the user's full history.
  let spanStart = payload.start_date ? new Date(`${payload.start_date}T00:00:00Z`) : null;
  let spanEnd = payload.end_date ? new Date(`${payload.end_date}T23:59:59Z`) : null;

  if (!spanStart || !spanEnd || isNaN(spanStart.getTime()) || isNaN(spanEnd.getTime())) {
    safeReportProgress(job, 2, 'Determining scan range...');
    const range = await getDataSpan(fluxbase, userId);
    if (!range) {
      safeReportProgress(job, 100, 'No locations to scan');
      return { success: true, result: { section_count: 0, scanned_windows: 0 } };
    }
    spanStart = spanStart && !isNaN(spanStart.getTime()) ? spanStart : range.start;
    spanEnd = spanEnd && !isNaN(spanEnd.getTime()) ? spanEnd : range.end;
  }
  if (spanStart > spanEnd) {
    return { success: false, error: 'start_date is after end_date' };
  }

  const windows = monthWindows(spanStart, spanEnd);
  console.log(
    `Duplicate scan: ${windows.length} month window(s) ` +
      `(${spanStart.toISOString()} .. ${spanEnd.toISOString()})`
  );

  const allRows: RawClusterRow[] = [];
  for (let i = 0; i < windows.length; i++) {
    if (await job.isCancelled?.()) {
      return { success: false, error: 'Cancelled' };
    }
    const w = windows[i];
    const label = w.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    safeReportProgress(job, Math.round((i / windows.length) * 90), `Scanning ${label}...`);

    try {
      const draft = await detectForRange(
        fluxbase,
        w.start.toISOString(),
        w.end.toISOString()
      );
      if (draft) {
        allRows.push(...draftToRows(draft.clusters));
      }
    } catch (err) {
      // One window failing (e.g. timeout on a huge month) must not lose the
      // rest of the scan — report and continue.
      console.warn(`Scan window ${w.start.toISOString()} failed:`, err);
    }
  }

  if (allRows.length === 0) {
    safeReportProgress(job, 100, 'Scan complete — no overlapping recordings found');
    return { success: true, result: { section_count: 0, scanned_windows: windows.length } };
  }

  safeReportProgress(job, 95, 'Saving scan results...');

  // Re-assign stable section ids across the merged windows (stitching first,
  // so a trip spanning a month boundary becomes ONE section), then persist a
  // single report for the whole scan.
  const clusters: DuplicateCluster[] = stitchClusters(
    buildClusters(allRows),
    DEFAULT_DUPLICATE_PARAMS.merge_gap_min
  );
  const source: DuplicateReportSource = {
    kind: 'scan',
    start_date: spanStart.toISOString().slice(0, 10),
    end_date: spanEnd.toISOString().slice(0, 10)
  };
  const summary = buildSummary(clusters);

  const { data: report, error: writeError } = await fluxbase
    .from('duplicate_reports')
    .insert({
      user_id: userId,
      status: 'pending_review',
      source_type: 'scan',
      source,
      clusters,
      summary
    })
    .select('id')
    .single();

  if (writeError || !report) {
    return { success: false, error: `Failed to save scan report: ${writeError?.message}` };
  }

  const reportId = (report as { id: string }).id;
  console.log(
    `Duplicate scan found ${summary.section_count} section(s) ` +
      `(${summary.recommended_remove_count} points) — report ${reportId}`
  );
  safeReportProgress(
    job,
    100,
    `Scan complete — ${summary.section_count} overlapping section(s) found`
  );

  return {
    success: true,
    result: {
      report_id: reportId,
      section_count: summary.section_count,
      recommended_remove_count: summary.recommended_remove_count,
      scanned_windows: windows.length
    }
  };
}

/** detectForRange returns fully-built clusters; flatten back to raw rows so the merged set can be rebuilt with continuous ids. */
function draftToRows(clusters: DuplicateCluster[]): RawClusterRow[] {
  return clusters.map((c) => ({
    key_a: c.a.key,
    key_b: c.b.key,
    start_ts: c.start,
    end_ts: c.end,
    pair_count: c.pair_count,
    count_a: c.a.count,
    count_b: c.b.count,
    median_acc_a: c.a.median_accuracy,
    median_acc_b: c.b.median_accuracy,
    duration_s: Math.max(
      0,
      Math.round((new Date(c.end).getTime() - new Date(c.start).getTime()) / 1000)
    )
  }));
}

/** Full-history bounds from the user's points; null when there are none. */
async function getDataSpan(
  fluxbase: FluxbaseClient,
  userId: string
): Promise<{ start: Date; end: Date } | null> {
  const [first, last] = await Promise.all([
    fluxbase
      .from('tracker_data')
      .select('recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: true })
      .limit(1),
    fluxbase
      .from('tracker_data')
      .select('recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(1)
  ]);
  const startStr = first.data?.[0]?.recorded_at as string | undefined;
  const endStr = last.data?.[0]?.recorded_at as string | undefined;
  if (!startStr || !endStr) return null;
  return { start: new Date(startStr), end: new Date(endStr) };
}
