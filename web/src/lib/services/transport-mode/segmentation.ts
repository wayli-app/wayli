// /Users/bart/Dev/wayli/web/src/lib/services/transport-mode/segmentation.ts
//
// Gap-based segmentation shared by the detector and the persistence job.

/**
 * Split continuity after this long without a fix (tunnels, phone off, flights).
 * Matches the legacy enhanced-transport-mode.ts threshold so behaviour is
 * consistent between the HMM path and the fallback rule path.
 */
export const SEGMENT_GAP_MS = 5 * 60 * 1000;

/**
 * Lookback applied to the incremental watermark: when the job resumes from
 * `last_processed_at`, it re-reads points from `last_processed_at - LOOKBACK`
 * so the tail of the previously-decoded segment is re-decoded in full. Modes
 * depend on the whole segment (Viterbi is global), so the last few points of a
 * segment can change once their neighbours arrive. 1 hour comfortably covers a
 * typical commute segment.
 */
export const LOOKBACK_MS = 60 * 60 * 1000;
