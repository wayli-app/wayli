/**
 * Polarsteps Import Job
 *
 * Imports a Polarsteps data export (user_data.zip) into Wayli.
 * Creates trips, journal entries, GPS data, and uploads photos.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 1800
 * @fluxbase:memory 1024
 * @fluxbase:allow-net true
 * @fluxbase:allow-read true
 * @fluxbase:allow-write true
 * @fluxbase:allow-env true
 */

// @ts-types="npm:@types/jszip"
import JSZip from 'npm:jszip@3.10.1';

import type { FluxbaseClient, JobUtils } from './types';

interface PolarstepsLocation {
  lat: number;
  lon: number;
  time: number;
}

interface PolarstepsStep {
  id: number;
  name: string;
  description: string;
  start_time: number;
  end_time: number | null;
  slug: string;
  uuid: string;
}

interface PolarstepsTrip {
  id: number;
  name: string;
  start_date: number;
  end_date: number;
  total_km: number;
  cover_photo_path: string;
  timezone_id: string;
  all_steps: PolarstepsStep[];
  uuid: string;
}

interface Payload {
  storagePath: string;
}

function safeReportProgress(job: JobUtils, percent: number, message: string): void {
  try {
    job.reportProgress(percent, message);
  } catch {
    console.log(`[Progress ${percent}%] ${message}`);
  }
}

function unixToISO(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function dateFromUnix(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export async function handler(
  _req: Request,
  fluxbase: FluxbaseClient,
  fluxbaseService: FluxbaseClient,
  job: JobUtils
) {
  try {
    return await doImport(fluxbase, fluxbaseService, job);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[polarsteps-import] FATAL:', msg);
    if (error instanceof Error && error.stack) console.error(error.stack);
    try {
      job.reportProgress(0, `Import failed: ${msg}`);
    } catch {}
    throw error;
  }
}

async function doImport(fluxbase: FluxbaseClient, fluxbaseService: FluxbaseClient, job: JobUtils) {
  const ctx = job.getJobContext();
  const userId = ctx.user?.id;
  if (!userId) throw new Error('No user ID in job context');

  const payload = ctx.payload as Payload;
  if (!payload?.storagePath) throw new Error('No storagePath in payload');

  safeReportProgress(job, 5, 'Downloading export file...');

  // Download the zip file from storage
  const fileResponse = await fluxbaseService.storage
    .from('temp-files')
    .download(payload.storagePath);
  if (!fileResponse.data) throw new Error('Failed to download export file');

  const zipData = await fileResponse.data.arrayBuffer();
  safeReportProgress(job, 10, 'Extracting archive...');

  // Extract zip using JSZip (pure JS, no subprocess)
  const zip = await JSZip.loadAsync(zipData);
  const files = new Map<string, Uint8Array>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const data = await entry.async('uint8array');
    files.set(path, data);
  }

  // Helper to read a text file from the extracted zip
  function readZipText(path: string): string | null {
    for (const [zipPath, data] of files) {
      if (zipPath === path || zipPath.endsWith(`/${path}`)) {
        return new TextDecoder().decode(data);
      }
    }
    return null;
  }

  // Find files matching a regex pattern
  function findZipFiles(pattern: RegExp): Array<{ path: string; data: Uint8Array }> {
    const results: Array<{ path: string; data: Uint8Array }> = [];
    for (const [path, data] of files) {
      if (pattern.test(path)) {
        results.push({ path, data });
      }
    }
    return results;
  }

  safeReportProgress(job, 15, 'Reading trip data...');

  // Find all trip.json files
  const tripJsonFiles = findZipFiles(/trip\/[^/]+\/trip\.json$/);

  if (tripJsonFiles.length === 0) {
    safeReportProgress(job, 100, 'No trips found in export');
    return { success: true, tripsImported: 0, message: 'No trips found' };
  }

  let tripsImported = 0;
  let tripsMerged = 0;
  let entriesCreated = 0;
  let gpsPointsImported = 0;
  let photosUploaded = 0;
  let photosSkipped = 0;

  for (let i = 0; i < tripJsonFiles.length; i++) {
    const tripFile = tripJsonFiles[i];
    const progress = 15 + Math.round((i / tripJsonFiles.length) * 75);

    // Parse trip.json
    let tripJson: PolarstepsTrip;
    try {
      tripJson = JSON.parse(new TextDecoder().decode(tripFile.data));
    } catch {
      console.log(`Skipping unparseable trip.json: ${tripFile.path}`);
      continue;
    }

    safeReportProgress(
      job,
      progress,
      `Importing trip ${i + 1}/${tripJsonFiles.length}: ${tripJson.name}`
    );

    // Extract trip directory prefix (e.g., "trip/japan_16579360/")
    const tripDirPrefix = tripFile.path.replace(/trip\.json$/, '');

    const startDate = dateFromUnix(tripJson.start_date);
    const endDate = dateFromUnix(tripJson.end_date);

    // Check for existing trip (merge by title + date overlap)
    const existingTrip = await findExistingTrip(
      fluxbase,
      userId,
      tripJson.name,
      startDate,
      endDate
    );
    let tripId: string;
    let isNewTrip = false;

    if (existingTrip) {
      tripId = existingTrip;
      tripsMerged++;
      safeReportProgress(job, progress, `Merging into existing trip: ${tripJson.name}`);
    } else {
      isNewTrip = true;
      let imageUrl: string | null = null;

      // Try to download cover photo from Polarsteps S3
      if (tripJson.cover_photo_path) {
        try {
          imageUrl = await downloadAndUploadPhoto(
            fluxbaseService,
            tripJson.cover_photo_path,
            userId,
            'covers',
            `polarsteps-cover-${tripJson.id}.jpg`
          );
        } catch {
          console.log(`Cover photo download failed for trip ${tripJson.name}`);
        }
      }

      const { data: newTrip, error: tripError } = await fluxbaseService
        .from('trips')
        .insert({
          user_id: userId,
          title: tripJson.name,
          start_date: startDate,
          end_date: endDate,
          status: 'completed',
          visibility: 'private',
          image_url: imageUrl,
          metadata: {
            distanceTraveled: Math.round((tripJson.total_km ?? 0) * 1000),
            importedFrom: 'polarsteps',
            polarstepsId: tripJson.id,
            polarstepsUuid: tripJson.uuid
          }
        })
        .select('id')
        .single();

      if (tripError || !newTrip) {
        console.log(`Failed to create trip ${tripJson.name}: ${tripError?.message}`);
        continue;
      }

      tripId = (newTrip as any).id;
      tripsImported++;
    }

    // Import journal entries (steps) + photos
    for (const step of tripJson.all_steps ?? []) {
      const entryDate = dateFromUnix(step.start_time);

      // Skip if entry already exists (for merge case)
      if (!isNewTrip) {
        const { data: existing } = await fluxbaseService
          .from('trip_entries')
          .select('id')
          .eq('trip_id', tripId)
          .eq('entry_date', entryDate)
          .limit(1);
        if (existing && existing.length > 0) continue;
      }

      await fluxbaseService.from('trip_entries').insert({
        trip_id: tripId,
        user_id: userId,
        title: step.name || '',
        body: step.description || '',
        entry_date: entryDate,
        created_at: unixToISO(step.start_time)
      });
      entriesCreated++;

      // Find and upload photos for this step (by step ID in path)
      const photoFiles = findZipFiles(
        new RegExp(`${tripDirPrefix}[^/]*${step.id}[^/]*/photos/.+\\.jpg`, 'i')
      );

      for (const photoFile of photoFiles) {
        try {
          const photoName = photoFile.path.split('/').pop() || `photo-${Date.now()}.jpg`;
          const storagePath = `${userId}/${tripId}/${photoName}`;
          const blob = new Blob([photoFile.data], { type: 'image/jpeg' });

          const { error: uploadErr } = await fluxbaseService.storage
            .from('trip-images')
            .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });

          if (uploadErr) {
            photosSkipped++;
            continue;
          }

          const { data: urlData } = fluxbaseService.storage
            .from('trip-images')
            .getPublicUrl(storagePath);

          await fluxbaseService.from('trip_media').insert({
            trip_id: tripId,
            user_id: userId,
            storage_path: urlData.publicUrl,
            thumbnail_path: urlData.publicUrl,
            media_type: 'image',
            caption: '',
            sort_order: photosUploaded
          });

          photosUploaded++;
        } catch {
          photosSkipped++;
        }
      }
    }

    // Import GPS data from locations.json
    const locationsText = readZipText(`${tripDirPrefix}locations.json`);
    if (locationsText) {
      try {
        const parsed = JSON.parse(locationsText);
        const locations: PolarstepsLocation[] = parsed.locations ?? [];

        if (locations.length > 0) {
          safeReportProgress(
            job,
            progress,
            `Importing ${locations.length} GPS points for ${tripJson.name}`
          );

          const batchSize = 500;
          for (let j = 0; j < locations.length; j += batchSize) {
            const batch = locations.slice(j, j + batchSize);
            const rows = batch.map((loc) => ({
              user_id: userId,
              tracker_type: 'polarsteps',
              recorded_at: unixToISO(loc.time),
              location: { type: 'Point', coordinates: [loc.lon, loc.lat] },
              country_code: null,
              speed: null,
              distance: 0,
              time_spent: 0
            }));
            await fluxbaseService.from('tracker_data').insert(rows);
            gpsPointsImported += batch.length;
          }
        }
      } catch {
        console.log(`Failed to parse locations.json for trip ${tripJson.name}`);
      }
    }
  }

  safeReportProgress(job, 100, 'Import complete!');

  return {
    success: true,
    tripsImported,
    tripsMerged,
    entriesCreated,
    gpsPointsImported,
    photosUploaded,
    photosSkipped
  };
}

// ── Helpers ──

async function findExistingTrip(
  fluxbase: FluxbaseClient,
  userId: string,
  title: string,
  startDate: string,
  endDate: string
): Promise<string | null> {
  const { data } = await fluxbase
    .from('trips')
    .select('id, title, start_date, end_date')
    .eq('user_id', userId)
    .ilike('title', title);

  if (!data || data.length === 0) return null;

  for (const trip of data as any[]) {
    const existingStart = trip.start_date?.slice(0, 10);
    const existingEnd = trip.end_date?.slice(0, 10);
    if (existingStart && existingEnd) {
      const overlapStart = existingStart > startDate ? existingStart : startDate;
      const overlapEnd = existingEnd < endDate ? existingEnd : endDate;
      if (overlapStart <= overlapEnd) return trip.id;
    }
  }

  return null;
}

async function downloadAndUploadPhoto(
  fluxbaseService: FluxbaseClient,
  url: string,
  userId: string,
  subFolder: string,
  filename: string
): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;

    const blob = await resp.blob();
    const path = `${userId}/${subFolder}/${filename}`;

    const { error } = await fluxbaseService.storage.from('trip-images').upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: false
    });

    if (error) return null;

    const { data } = fluxbaseService.storage.from('trip-images').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}
