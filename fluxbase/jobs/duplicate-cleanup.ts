/**
 * Duplicate Cleanup Job
 *
 * Applies a user-reviewed duplicate report (#274): for every section the user
 * did not skip, re-derives the exact delete set (points of the losing session
 * that still match the kept session inside the section window), deletes it,
 * repairs the derived metrics that the distance trigger can no longer see,
 * and marks the report applied (or dismissed when everything was skipped).
 *
 * Never runs without an explicit report id — detection only ever creates
 * reviewable reports; this job only ever executes a reviewed decision.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 1800
 * @fluxbase:allow-read true
 */

import {
  findVictims,
  type DuplicateCluster,
  type DuplicateParams
} from './_shared/services/duplicate-detection.service.ts';
import { resetIncrementalWatermarks, safeReportProgress } from './_shared/utils/import-helpers.ts';

import type { FluxbaseClient, JobUtils } from './types';

interface CleanupDecision {
  cluster_id: string;
  /** 'a' | 'b' = keep that side (delete the other); 'skip' = leave untouched. */
  keep: 'a' | 'b' | 'skip';
}

interface DuplicateCleanupPayload {
  report_id: string;
  decisions: CleanupDecision[];
}

interface ReportRow {
  id: string;
  user_id: string;
  status: string;
  params: DuplicateParams | null;
  clusters: DuplicateCluster[];
  summary: Record<string, unknown> | null;
}

export async function handler(
  _req: Request,
  fluxbase: FluxbaseClient,
  fluxbaseService: FluxbaseClient,
  job: JobUtils
) {
  const context = job.getJobContext();
  const payload = context.payload as DuplicateCleanupPayload;
  const userId = context.user?.id;

  if (!userId) {
    return { success: false, error: 'No user context available' };
  }
  if (!payload?.report_id || !Array.isArray(payload.decisions)) {
    return { success: false, error: 'Payload must include report_id and decisions[]' };
  }

  // RLS (caller-scoped client) guarantees this is the caller's own report.
  const { data: report, error: reportError } = await fluxbase
    .from('duplicate_reports')
    .select('id, user_id, status, params, clusters, summary')
    .eq('id', payload.report_id)
    .maybeSingle();

  if (reportError || !report) {
    return { success: false, error: `Report not found: ${reportError?.message ?? 'no row'}` };
  }
  const row = report as unknown as ReportRow;
  if (row.status !== 'pending_review') {
    return { success: false, error: `Report is already ${row.status}` };
  }

  const params: DuplicateParams = row.params ?? {
    time_window_s: 180,
    distance_m: 150,
    merge_gap_min: 10,
    min_pairs: 8
  };

  // Resolve decisions against the stored sections. A missing guard here would
  // delete from the wrong side — default to skipping anything inconsistent.
  const sections: Array<{ cluster: DuplicateCluster; keep: 'a' | 'b' }> = [];
  let skipped = 0;
  for (const decision of payload.decisions) {
    const cluster = row.clusters?.find((c) => c.id === decision.cluster_id);
    if (!cluster) {
      console.warn(`Decision references unknown section ${decision.cluster_id} — skipping`);
      skipped++;
      continue;
    }
    if (decision.keep === 'skip') {
      skipped++;
      continue;
    }
    if (decision.keep !== 'a' && decision.keep !== 'b') {
      console.warn(`Invalid keep '${decision.keep}' for section ${decision.cluster_id} — skipping`);
      skipped++;
      continue;
    }
    sections.push({ cluster, keep: decision.keep });
  }

  if (sections.length === 0) {
    await markReport(fluxbase, row.id, 'dismissed', row.summary, 0);
    safeReportProgress(job, 100, 'Nothing to remove');
    return {
      success: true,
      result: { removed_count: 0, sections_applied: 0, sections_skipped: skipped, dismissed: true }
    };
  }

  // ── Derive the exact delete set per section, then delete ──
  safeReportProgress(job, 5, 'Deriving duplicate points...');
  const deletedAt = new Date().toISOString();
  const affectedWindows: Array<{ start: string; end: string }> = [];
  let removedCount = 0;

  for (let i = 0; i < sections.length; i++) {
    if (await job.isCancelled?.()) {
      return { success: false, error: 'Cancelled' };
    }
    const { cluster, keep } = sections[i];
    const keeper = keep === 'a' ? cluster.a : cluster.b;
    const loser = keep === 'a' ? cluster.b : cluster.a;

    safeReportProgress(
      job,
      5 + Math.round((i / sections.length) * 45),
      `Deriving duplicates: section ${i + 1}/${sections.length}`
    );

    const victims = await findVictims(
      fluxbase,
      { keeperKey: keeper.key, loserKey: loser.key, start: cluster.start, end: cluster.end },
      params
    );
    if (victims.length === 0) {
      console.log(`Section ${cluster.id}: nothing left to remove`);
      continue;
    }

    const removed = await deleteVictims(fluxbase, victims);
    removedCount += removed;
    affectedWindows.push({ start: cluster.start, end: cluster.end });
    console.log(
      `Section ${cluster.id}: removed ${removed}/${victims.length} ${loser.key} point(s) ` +
        `(kept ${keeper.key})`
    );
  }

  safeReportProgress(job, 55, `Removed ${removedCount.toLocaleString()} duplicate points`);

  // ── Repair derived data ──
  if (removedCount > 0) {
    // 1. Distance/speed/time_spent: deleting points orphans the derived chain
    // (the trigger only fires on INSERT/UPDATE of a row). Touching the rows
    // around each section window re-fires the trigger, which recomputes from
    // the new chronological predecessor.
    await repairDistances(fluxbase, affectedWindows);
    safeReportProgress(job, 70, 'Repaired point distances');

    // 2. Incremental jobs must re-see the affected range.
    await resetIncrementalWatermarks(fluxbaseService, userId);

    // 3. Per-day activity cache + visited countries aggregate from the points
    // we just changed; fire async refreshes (best-effort, they run standalone).
    await fireAsyncRpc(fluxbase, 'refresh-daily-activity-sql');
    await fireAsyncRpc(fluxbase, 'refresh-visited-countries-sql');
  }

  const applied = sections.filter((s) =>
    affectedWindows.some((w) => w.start === s.cluster.start && w.end === s.cluster.end)
  ).length;
  await markReport(fluxbase, row.id, 'applied', row.summary, removedCount, deletedAt);

  safeReportProgress(
    job,
    100,
    `Removed ${removedCount.toLocaleString()} duplicate points across ${applied} section(s)`
  );

  return {
    success: true,
    result: {
      removed_count: removedCount,
      sections_applied: applied,
      sections_skipped: skipped
    }
  };
}

/** Delete victims in timestamp batches (mirrors the data editor's deletePoints). */
async function deleteVictims(fluxbase: FluxbaseClient, timestamps: string[]): Promise<number> {
  let deleted = 0;
  const BATCH = 500;
  for (let i = 0; i < timestamps.length; i += BATCH) {
    const batch = timestamps.slice(i, i + BATCH);
    const { error } = await fluxbase.from('tracker_data').delete().in('recorded_at', batch);
    if (error) {
      console.error(`Victim delete batch failed (${batch.length} rows):`, error);
      throw new Error(`Failed to delete duplicates: ${error.message}`);
    }
    deleted += batch.length;
  }
  return deleted;
}

/**
 * Re-fire tracker_data_distance_trigger over each affected window (± the
 * merge margin): the trigger recomputes distance/time_spent/speed from the
 * chronological predecessor on every UPDATE, so a no-op update heals the gap
 * left by the deleted points.
 */
async function repairDistances(
  fluxbase: FluxbaseClient,
  windows: Array<{ start: string; end: string }>
): Promise<void> {
  for (const w of windows) {
    try {
      const start = new Date(new Date(w.start).getTime() - 10 * 60_000).toISOString();
      const end = new Date(new Date(w.end).getTime() + 10 * 60_000).toISOString();
      const { error } = await fluxbase
        .from('tracker_data')
        .update({ updated_at: new Date().toISOString() })
        .gte('recorded_at', start)
        .lte('recorded_at', end);
      if (error) {
        console.warn(`Distance repair failed for window ${start}..${end}:`, error);
      }
    } catch (err) {
      console.warn('Distance repair error:', err);
    }
  }
}

async function fireAsyncRpc(fluxbase: FluxbaseClient, name: string): Promise<void> {
  try {
    const { error } = await fluxbase.rpc.invoke(name, {}, { namespace: 'wayli', async: true });
    if (error) console.warn(`${name} trigger failed:`, error);
  } catch (err) {
    console.warn(`${name} trigger error:`, err);
  }
}

async function markReport(
  fluxbase: FluxbaseClient,
  reportId: string,
  status: 'applied' | 'dismissed',
  summary: Record<string, unknown> | null,
  removedCount: number,
  appliedAt?: string
): Promise<void> {
  try {
    const { error } = await fluxbase
      .from('duplicate_reports')
      .update({
        status,
        updated_at: new Date().toISOString(),
        summary: {
          ...(summary ?? {}),
          removed_count: removedCount,
          ...(appliedAt ? { applied_at: appliedAt } : {})
        }
      })
      .eq('id', reportId);
    if (error) console.warn(`Failed to mark report ${status}:`, error);
  } catch (err) {
    console.warn(`Error marking report ${status}:`, err);
  }
}
