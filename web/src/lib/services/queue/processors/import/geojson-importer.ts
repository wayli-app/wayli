// web/src/lib/services/queue/processors/import/geojson-importer.ts

import { cpus } from 'node:os';
import { supabase } from '$lib/core/supabase/worker';
import { JobQueueService } from '$lib/services/queue/job-queue.service.worker';
import { checkJobCancellation } from '$lib/utils/job-cancellation';
import {
  getCountryForPoint as getCountryForPointExternal,
  normalizeCountryCode as normalizeCountryCodeExternal
} from '$lib/services/external/country-reverse-geocoding.service';

type Feature = {
  type: string;
  geometry?: { type: string; coordinates: number[] };
  properties?: Record<string, unknown>;
};

type ErrorSummary = {
  counts: Record<string, number>;
  samples: Array<{ idx: number; reason: string }>;
};

export async function importGeoJSONWithProgress(
  content: string,
  userId: string,
  jobId: string,
  fileName: string
): Promise<number> {
  try {
    console.log('🗺️ Starting GeoJSON import with progress tracking');
    const geojson = JSON.parse(content);
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    if (geojson.type === 'FeatureCollection' && geojson.features) {
      const totalFeatures = geojson.features.length as number;
      console.log(`📊 Processing ${totalFeatures.toLocaleString()} features from ${fileName}`);

      await JobQueueService.updateJobProgress(jobId, 0, {
        message: `🗺️ Processing ${totalFeatures.toLocaleString()} GeoJSON features...`,
        fileName,
        format: 'GeoJSON',
        totalProcessed: 0,
        totalItems: totalFeatures
      });

      const startTime = Date.now();
      const lastLogTime = startTime;

      const results = await processFeaturesInParallel(
        geojson.features as Feature[],
        userId,
        jobId,
        fileName,
        startTime,
        lastLogTime
      );

      importedCount = results.importedCount;
      skippedCount = results.skippedCount;
      errorCount = results.errorCount;

      const totalTime = (Date.now() - startTime) / 1000;
      console.log(`✅ GeoJSON import completed!`);
      console.log(`📊 Final stats:`);
      console.log(`   📥 Imported: ${importedCount.toLocaleString()} points`);
      console.log(`   ⏭️ Skipped: ${skippedCount.toLocaleString()} points`);
      console.log(`   ❌ Errors: ${errorCount.toLocaleString()} points`);
      console.log(`   ⏱️ Total time: ${totalTime.toFixed(1)}s`);
      console.log(`   🚀 Average rate: ${(importedCount / totalTime).toFixed(1)} points/sec`);
    }

    return importedCount;
  } catch (error) {
    if (error instanceof Error && error.message === 'Job was cancelled') {
      console.log(`🛑 GeoJSON import was cancelled`);
      return 0;
    }
    console.error('❌ Error in GeoJSON import:', error);
    throw error;
  }
}

async function processFeaturesInParallel(
  features: Feature[],
  userId: string,
  jobId: string,
  fileName: string,
  startTime: number,
  lastLogTimeInitial: number
): Promise<{ importedCount: number; skippedCount: number; errorCount: number }> {
  const totalFeatures = features.length;
  let importedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errorSummary: ErrorSummary = { counts: {}, samples: [] };

  const cpuCores = cpus().length;
  const CHUNK_SIZE = Math.max(50, Math.min(500, Math.floor(totalFeatures / (cpuCores * 8))));
  const CONCURRENT_CHUNKS = Math.min(cpuCores * 2, 8);

  console.log(
    `🔄 Parallel processing: ${cpuCores} CPU cores, ${CHUNK_SIZE} features per chunk, ${CONCURRENT_CHUNKS} concurrent chunks (optimized for progress updates)`
  );

  let lastLogTime = lastLogTimeInitial;

  for (let i = 0; i < features.length; i += CHUNK_SIZE * CONCURRENT_CHUNKS) {
    await checkJobCancellation(jobId);

    const chunkPromises: Promise<{ imported: number; skipped: number; errors: number; errorSummary: ErrorSummary }>[] = [];

    for (let j = 0; j < CONCURRENT_CHUNKS && i + j * CHUNK_SIZE < features.length; j++) {
      const chunkStart = i + j * CHUNK_SIZE;
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, features.length);
      const chunk = features.slice(chunkStart, chunkEnd);

      chunkPromises.push(processFeatureChunk(chunk, userId, chunkStart, jobId, totalFeatures, fileName));
    }

    const chunkResults = await Promise.allSettled(chunkPromises);

    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        importedCount += result.value.imported;
        skippedCount += result.value.skipped;
        errorCount += result.value.errors;
        // merge error summaries
        for (const [k, v] of Object.entries(result.value.errorSummary.counts)) {
          errorSummary.counts[k] = (errorSummary.counts[k] || 0) + v;
        }
        for (const s of result.value.errorSummary.samples) {
          if (errorSummary.samples.length < 10) errorSummary.samples.push(s);
        }
      } else {
        errorCount += CHUNK_SIZE; // Count failed chunks as errors
        console.error('❌ Chunk processing failed:', result.reason);
      }
    }

    const currentTime = Date.now();
    const processed = Math.min(i + CHUNK_SIZE * CONCURRENT_CHUNKS, totalFeatures);
    const progress = Math.round((processed / totalFeatures) * 100);

    if (processed % 100 === 0 || currentTime - lastLogTime > 10000) {
      const elapsedSeconds = (currentTime - startTime) / 1000;
      const rate = processed > 0 ? (processed / elapsedSeconds).toFixed(1) : '0';
      const eta = processed > 0 ? ((totalFeatures - processed) / (processed / elapsedSeconds)).toFixed(0) : '0';

      console.log(
        `📈 Progress: ${processed.toLocaleString()}/${totalFeatures.toLocaleString()} (${progress}%) - Rate: ${rate} features/sec - ETA: ${eta}s - Imported: ${importedCount.toLocaleString()} - Skipped: ${skippedCount.toLocaleString()} - Errors: ${errorCount.toLocaleString()}`
      );

      const topErrors = Object.entries(errorSummary.counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');

      await JobQueueService.updateJobProgress(jobId, progress, {
        message: `🗺️ Processing GeoJSON features... ${processed.toLocaleString()}/${totalFeatures.toLocaleString()} (${progress}%)`,
        fileName,
        format: 'GeoJSON',
        totalProcessed: importedCount,
        totalItems: totalFeatures,
        currentFeature: processed + 1,
        rate: `${rate} features/sec`,
        eta: `${eta}s`,
        skipped: skippedCount,
        errors: errorCount,
        errorSummary: topErrors,
        errorSamples: errorSummary.samples
      });

      lastLogTime = currentTime;
    }

    if (importedCount > 0 && importedCount % 1000 === 0) {
      console.log(`🎉 Milestone: Imported ${importedCount.toLocaleString()} points!`);
      await JobQueueService.updateJobProgress(jobId, progress, {
        message: `🎉 Imported ${importedCount.toLocaleString()} points!`,
        fileName,
        format: 'GeoJSON',
        totalProcessed: importedCount,
        totalItems: totalFeatures,
        currentFeature: processed + 1
      });
    }
  }

  return { importedCount, skippedCount, errorCount };
}

async function processFeatureChunk(
  features: Feature[],
  userId: string,
  chunkStart: number,
  jobId?: string,
  totalFeatures?: number,
  fileName?: string
): Promise<{ imported: number; skipped: number; errors: number; errorSummary: ErrorSummary }> {
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const errorSummary: ErrorSummary = { counts: {}, samples: [] };

  const trackerData: Array<{
    user_id: string;
    tracker_type: string;
    location: string;
    recorded_at: string;
    country_code: string | null;
    geocode: unknown;
    altitude: number | null;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    activity_type: string | null;
    raw_data: Record<string, unknown>;
    created_at?: string;
  }> = [];

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    if (!feature || !feature.geometry) {
      skipped++;
      errorSummary.counts['missing geometry'] = (errorSummary.counts['missing geometry'] || 0) + 1;
      if (errorSummary.samples.length < 10) errorSummary.samples.push({ idx: chunkStart + i, reason: 'missing geometry' });
      continue;
    }

    if (feature.geometry?.type === 'Point' && feature.geometry.coordinates) {
      const [longitude, latitude] = feature.geometry.coordinates;
      const properties = feature.properties || {};

      let recordedAt = new Date().toISOString();
      if ((properties as any).timestamp && typeof (properties as any).timestamp === 'number') {
        const timestamp = (properties as any).timestamp as number;
        recordedAt = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp).toISOString();
      } else if ((properties as any).time && (typeof (properties as any).time === 'string' || typeof (properties as any).time === 'number')) {
        recordedAt = new Date((properties as any).time as any).toISOString();
      } else if ((properties as any).date && (typeof (properties as any).date === 'string' || typeof (properties as any).date === 'number')) {
        recordedAt = new Date((properties as any).date as any).toISOString();
      }

      let countryCode: string | null = null;
      if (typeof (properties as any).countrycode === 'string') {
        countryCode = (properties as any).countrycode as string;
      } else if (typeof (properties as any).country_code === 'string') {
        countryCode = (properties as any).country_code as string;
      } else if (typeof (properties as any).country === 'string') {
        countryCode = (properties as any).country as string;
      }

      if (!countryCode) {
        countryCode = safeGetCountryForPoint(latitude, longitude);
      }

      countryCode = safeNormalizeCountryCode(countryCode);

      let reverseGeocode = null;
      if ((properties as any).geodata) {
        reverseGeocode = (properties as any).geodata;
      }

      const altitude = typeof (properties as any).altitude === 'number'
        ? (properties as any).altitude as number
        : typeof (properties as any).elevation === 'number'
          ? (properties as any).elevation as number
          : null;

      const accuracy = typeof (properties as any).accuracy === 'number' ? (properties as any).accuracy as number : null;
      const speed = typeof (properties as any).speed === 'number'
        ? (properties as any).speed as number
        : typeof (properties as any).velocity === 'number'
          ? (properties as any).velocity as number
          : null;

      const heading = typeof (properties as any).heading === 'number'
        ? (properties as any).heading as number
        : typeof (properties as any).bearing === 'number'
          ? (properties as any).bearing as number
          : typeof (properties as any).course === 'number'
            ? (properties as any).course as number
            : null;

      const activityType = typeof (properties as any).activity_type === 'string' ? (properties as any).activity_type as string : null;

      trackerData.push({
        user_id: userId,
        tracker_type: 'import',
        location: `POINT(${longitude} ${latitude})`,
        recorded_at: recordedAt,
        country_code: countryCode,
        geocode: reverseGeocode,
        altitude,
        accuracy,
        speed,
        heading,
        activity_type: activityType,
        raw_data: { ...(properties as any), import_source: 'geojson' },
        created_at: new Date().toISOString()
      });
    } else {
      skipped++;
      const reason = feature.geometry ? `unsupported geometry ${feature.geometry.type}` : 'missing geometry';
      errorSummary.counts[reason] = (errorSummary.counts[reason] || 0) + 1;
      if (errorSummary.samples.length < 10) errorSummary.samples.push({ idx: chunkStart + i, reason });
    }
  }

  if (trackerData.length > 0) {
    try {
      const { error } = await supabase.from('tracker_data').upsert(trackerData, {
        onConflict: 'user_id,location,recorded_at',
        ignoreDuplicates: false
      });

      if (!error) {
        imported = trackerData.length;

        if (jobId && totalFeatures) {
          const processedFeatures = chunkStart + features.length;
          const progress = Math.round((processedFeatures / totalFeatures) * 100);

          if (processedFeatures % 50 === 0) {
            await JobQueueService.updateJobProgress(jobId, progress, {
              message: `🗺️ Processing features... ${processedFeatures.toLocaleString()}/${totalFeatures.toLocaleString()} (${progress}%)`,
              fileName,
              format: 'GeoJSON',
              totalProcessed: processedFeatures,
              totalItems: totalFeatures,
              currentFeature: processedFeatures + 1
            });
          }
        }
      } else {
        for (const data of trackerData) {
          try {
            const { error: singleError } = await supabase.from('tracker_data').upsert(data, {
              onConflict: 'user_id,location,recorded_at',
              ignoreDuplicates: false
            });
            if (!singleError) {
              imported++;
            } else if ((singleError as any).code === '23505') {
              skipped++;
            } else {
              errors++;
              const code = (singleError as any).code || 'unknown';
              errorSummary.counts[`db ${code}`] = (errorSummary.counts[`db ${code}`] || 0) + 1;
              if (errorSummary.samples.length < 10) errorSummary.samples.push({ idx: chunkStart, reason: `db ${code}` });
            }
          } catch (e: any) {
            errors++;
            const msg = e?.message || 'upsert throw';
            errorSummary.counts[msg] = (errorSummary.counts[msg] || 0) + 1;
            if (errorSummary.samples.length < 10) errorSummary.samples.push({ idx: chunkStart, reason: msg });
          }
        }
      }
    } catch (e: any) {
      for (const data of trackerData) {
        try {
          const { error: singleError } = await supabase.from('tracker_data').upsert(data, {
            onConflict: 'user_id,location,recorded_at',
            ignoreDuplicates: false
          });
          if (!singleError) {
            imported++;
          } else if ((singleError as any).code === '23505') {
            skipped++;
          } else {
            errors++;
            const code = (singleError as any).code || 'unknown';
            errorSummary.counts[`db ${code}`] = (errorSummary.counts[`db ${code}`] || 0) + 1;
            if (errorSummary.samples.length < 10) errorSummary.samples.push({ idx: chunkStart, reason: `db ${code}` });
          }
        } catch (err: any) {
          errors++;
          const msg = err?.message || 'upsert throw';
          errorSummary.counts[msg] = (errorSummary.counts[msg] || 0) + 1;
          if (errorSummary.samples.length < 10) errorSummary.samples.push({ idx: chunkStart, reason: msg });
        }
      }
    }
  }

  return { imported, skipped, errors, errorSummary };
}

function safeGetCountryForPoint(lat: number, lon: number): string | null {
  try {
    return getCountryForPointExternal(lat, lon);
  } catch (error) {
    console.warn('Failed to get country for point:', error);
    return null;
  }
}

function safeNormalizeCountryCode(countryCode: string | null): string | null {
  try {
    return normalizeCountryCodeExternal(countryCode);
  } catch (error) {
    console.warn('Failed to normalize country code:', error);
    return null;
  }
}


