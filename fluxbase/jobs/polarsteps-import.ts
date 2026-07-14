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

import type { FluxbaseClient, JobUtils } from './types';

interface PolarstepsLocation {
  lat: number;
  lon: number;
  time: number; // Unix timestamp (float)
}

interface PolarstepsStep {
  id: number;
  name: string;
  description: string;
  start_time: number;
  end_time: number | null;
  location: {
    lat: number;
    lon: number;
    name: string;
    detail: string;
    country_code: string;
  };
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
    try { job.reportProgress(0, `Import failed: ${msg}`); } catch {}
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

  // Extract zip using Deno's built-in decompression
  // Deno doesn't have native zip support, so we use the fflate library pattern
  // or manual extraction via subprocess
  const tmpDir = `/tmp/polarsteps-${Date.now()}`;
  try {
    await Deno.mkdir(tmpDir, { recursive: true });

    // Write zip to temp file and extract using unzip command
    const zipPath = `${tmpDir}/export.zip`;
    await Deno.writeFile(zipPath, new Uint8Array(zipData));

    const unzipProcess = new Deno.Command('unzip', {
      args: ['-o', '-q', zipPath, '-d', tmpDir],
      stdout: 'piped',
      stderr: 'piped'
    });
    const unzipResult = await unzipProcess.output();
    if (!unzipResult.success) {
      const stderr = new TextDecoder().decode(unzipResult.stderr);
      throw new Error(`Failed to extract zip: ${stderr}`);
    }

    await Deno.remove(zipPath);

    safeReportProgress(job, 15, 'Reading trip data...');

    // Find all trip directories
    const tripDir = `${tmpDir}/trip`;
    let tripDirs: string[] = [];
    try {
      for await (const entry of Deno.readDir(tripDir)) {
        if (entry.isDirectory) {
          tripDirs.push(`${tripDir}/${entry.name}`);
        }
      }
    } catch {
      // No trip directory
    }

    if (tripDirs.length === 0) {
      safeReportProgress(job, 100, 'No trips found in export');
      return { success: true, tripsImported: 0, message: 'No trips found' };
    }

    let tripsImported = 0;
    let tripsMerged = 0;
    let entriesCreated = 0;
    let gpsPointsImported = 0;
    let photosUploaded = 0;
    let photosSkipped = 0;

    for (let i = 0; i < tripDirs.length; i++) {
      const tripPath = tripDirs[i];
      const progress = 15 + Math.round((i / tripDirs.length) * 75);

      // Read trip.json
      let tripJson: PolarstepsTrip;
      try {
        const raw = await Deno.readTextFile(`${tripPath}/trip.json`);
        tripJson = JSON.parse(raw);
      } catch {
        console.log(`Skipping ${tripPath}: no trip.json`);
        continue;
      }

      safeReportProgress(
        job,
        progress,
        `Importing trip ${i + 1}/${tripDirs.length}: ${tripJson.name}`
      );

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
        // Create new trip
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

      // Import journal entries (steps)
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

        // Upload photos for this step
        const stepSlug = step.slug || '';
        const stepPhotosDir = findStepPhotosDir(tripPath, stepSlug, step.id);
        if (stepPhotosDir) {
          const photoResult = await uploadStepPhotos(
            fluxbaseService,
            stepPhotosDir,
            userId,
            tripId
          );
          photosUploaded += photoResult.uploaded;
          photosSkipped += photoResult.skipped;
        }
      }

      // Import GPS data from locations.json
      let locationsPath: string;
      try {
        const raw = await Deno.readTextFile(`${tripPath}/locations.json`);
        const parsed = JSON.parse(raw);
        const locations: PolarstepsLocation[] = parsed.locations ?? [];

        if (locations.length > 0) {
          safeReportProgress(
            job,
            progress,
            `Importing ${locations.length} GPS points for ${tripJson.name}`
          );

          // Batch insert (500 at a time)
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
        console.log(`No locations.json for trip ${tripJson.name}`);
      }
    }

    safeReportProgress(job, 95, 'Cleaning up...');

    // Cleanup temp directory
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // non-critical
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
  } catch (error) {
    // Cleanup on error
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // ignore
    }
    throw error;
  }
}

// ── Helper functions ──

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

  // Check date overlap
  for (const trip of data as any[]) {
    const existingStart = trip.start_date?.slice(0, 10);
    const existingEnd = trip.end_date?.slice(0, 10);
    if (existingStart && existingEnd) {
      const overlapStart = existingStart > startDate ? existingStart : startDate;
      const overlapEnd = existingEnd < endDate ? existingEnd : endDate;
      if (overlapStart <= overlapEnd) return trip.id; // Overlapping
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

function findStepPhotosDir(tripPath: string, stepSlug: string, stepId: number): string | null {
	// Polarsteps stores photos in: trip/{trip_slug}/  {step_slug}_{step_id}/photos/
	// We need to find the directory by scanning since slugs may have special characters
	try {
		const entries = [...Deno.readDirSync(tripPath)];
		for (const entry of entries) {
			if (entry.isDirectory && entry.name.includes(String(stepId))) {
				const photosDir = `${tripPath}/${entry.name}/photos`;
				try {
					const photos = [...Deno.readDirSync(photosDir)];
					if (photos.length > 0) return photosDir;
				} catch {
					// no photos dir
				}
			}
		}
	} catch {
		// dir not readable
	}
	return null;
}

async function uploadStepPhotos(
  fluxbaseService: FluxbaseClient,
  photosDir: string,
  userId: string,
  tripId: string
): Promise<{ uploaded: number; skipped: number }> {
  let uploaded = 0;
  let skipped = 0;

	try {
		const files = [...Deno.readDirSync(photosDir)].filter(
			(f) => f.isFile && f.name.endsWith('.jpg')
		);

    for (const file of files) {
      try {
        const filePath = `${photosDir}/${file.name}`;
        const fileData = await Deno.readFile(filePath);
        const blob = new Blob([fileData], { type: 'image/jpeg' });

        const storagePath = `${userId}/${tripId}/${file.name}`;
        const { error } = await fluxbaseService.storage
          .from('trip-images')
          .upload(storagePath, blob, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (error) {
          skipped++;
          continue;
        }

        const { data } = fluxbaseService.storage.from('trip-images').getPublicUrl(storagePath);

        // Create media record
        await fluxbaseService.from('trip_media').insert({
          trip_id: tripId,
          user_id: userId,
          storage_path: data.publicUrl,
          thumbnail_path: data.publicUrl,
          media_type: 'image',
          caption: '',
          sort_order: uploaded
        });

        uploaded++;
      } catch {
        skipped++;
      }
    }
  } catch {
    // dir not readable
  }

  return { uploaded, skipped };
}
