import type { Job, JobType } from '$lib/types/job-queue.types';
import { reverseGeocode } from '../external/nominatim.service';
import { supabase } from '$lib/core/supabase/worker';
import { JobQueueService } from './job-queue.service.worker';

export class JobProcessorService {
  static async processJob(job: Job): Promise<void> {
    const processor = this.getJobProcessor(job.type);
    if (!processor) {
      throw new Error(`No processor found for job type: ${job.type}`);
    }

    await processor(job);
  }

  private static getJobProcessor(jobType: JobType) {
    const processors: Record<JobType, (job: Job) => Promise<void>> = {
      'reverse_geocoding_missing': this.processReverseGeocodingMissing.bind(this),
      'trip_cover_generation': this.processTripCoverGeneration.bind(this),
      'statistics_update': this.processStatisticsUpdate.bind(this),
      'data_import': this.processDataImport.bind(this)
    };

    return processors[jobType];
  }

  private static async processReverseGeocodingMissing(job: Job): Promise<void> {
    console.log(`🌍 Processing reverse geocoding missing job ${job.id}`);

    const startTime = Date.now();
    const BATCH_SIZE = 1000;
    const userId = job.created_by;
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    try {
      // Get total count of tracker data points that need geocoding
      const { count: trackerDataCount, error: trackerDataCountError } = await supabase
        .from('tracker_data')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('location', 'is', null)
        .is('reverse_geocode', null);

      if (trackerDataCountError) throw trackerDataCountError;

      const totalPoints = trackerDataCount || 0;
      console.log(`📊 Found ${totalPoints} tracker data points needing geocoding`);

      if (totalPoints === 0) {
        await JobQueueService.updateJobProgress(job.id, 100, {
          totalProcessed: 0,
          totalSuccess: 0,
          totalErrors: 0,
          message: 'No tracker data points found needing geocoding'
        });
        return;
      }

      // Process tracker data in batches
      await this.processTrackerDataInBatches(userId, BATCH_SIZE, job.id, totalPoints, startTime, (processed, success, errors) => {
        totalProcessed += processed;
        totalSuccess += success;
        totalErrors += errors;
        const progress = Math.round((totalProcessed / totalPoints) * 100);

        // Update job progress with detailed information
        JobQueueService.updateJobProgress(job.id, progress, {
          totalProcessed,
          totalSuccess,
          totalErrors,
          totalPoints,
          currentBatch: Math.ceil(totalProcessed / BATCH_SIZE),
          totalBatches: Math.ceil(totalPoints / BATCH_SIZE),
          message: `Processed ${totalProcessed.toLocaleString()}/${totalPoints.toLocaleString()} points (${errors} errors)`,
          estimatedTimeRemaining: this.calculateEstimatedTimeRemaining(totalProcessed, totalPoints, processed, 1)
        });
      });

      console.log(`✅ Reverse geocoding completed: ${totalSuccess} successful, ${totalErrors} errors out of ${totalProcessed} total`);

    } catch (error: unknown) {
      console.error(`❌ Error in reverse geocoding missing job:`, error);
      throw error;
    }
  }

  private static async processTrackerDataInBatches(
    userId: string,
    batchSize: number,
    jobId: string,
    totalPoints: number,
    startTime: number,
    progressCallback: (processed: number, success: number, errors: number) => void
  ): Promise<void> {
    let offset = 0;
    let totalProcessed = 0;
    const CONCURRENT_REQUESTS = 20; // Process 20 requests in parallel

    while (true) {
      // Get batch of tracker data points that need geocoding
      const { data: points, error } = await supabase
        .from('tracker_data')
        .select('user_id, location, reverse_geocode, recorded_at')
        .eq('user_id', userId)
        .not('location', 'is', null)
        .is('reverse_geocode', null)
        .range(offset, offset + batchSize - 1)
        .order('recorded_at', { ascending: false });

      if (error) throw error;

      if (!points || points.length === 0) {
        break; // No more points to process
      }

      console.log(`🔄 Processing batch of ${points.length} tracker data points (offset: ${offset})`);

      // Process points in parallel with controlled concurrency
      const results = await this.processPointsInParallel(points, CONCURRENT_REQUESTS, jobId, totalProcessed, totalPoints, startTime);

      // Update cumulative counters
      totalProcessed += results.processed;

      // Call progress callback (progress is already updated in parallel processing)
      progressCallback(results.processed, results.success, results.errors);

      // Move to next batch
      offset += batchSize;

      // If we got fewer points than batch size, we're done
      if (points.length < batchSize) {
        break;
      }
    }
  }

  private static async processPointsInParallel(
    points: Array<{
      user_id: string;
      location: string | { type: string; coordinates: number[]; crs?: { type: string; properties: { name: string } } };
      reverse_geocode: unknown;
      recorded_at: string;
    }>,
    concurrency: number,
    jobId: string,
    totalProcessed: number,
    totalPoints: number,
    startTime: number
  ): Promise<{ processed: number; success: number; errors: number }> {
    let processed = 0;
    let success = 0;
    let errors = 0;

    // Process points in chunks to control concurrency
    for (let i = 0; i < points.length; i += concurrency) {
      const chunk = points.slice(i, i + concurrency);

      // Process chunk in parallel
      const promises = chunk.map(point => this.processSinglePoint(point));
      const results = await Promise.allSettled(promises);

      // Count results
      for (const result of results) {
        processed++;
        if (result.status === 'fulfilled' && result.value) {
          success++;
        } else {
          errors++;
        }

        // Send progress update every 50 points
        if (processed % 50 === 0 || processed === points.length) {
          const currentTotalProcessed = totalProcessed + processed;
          const progress = Math.round((currentTotalProcessed / totalPoints) * 100);
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          const pointsPerSecond = elapsedSeconds > 0 ? currentTotalProcessed / elapsedSeconds : 0;
          const remainingPoints = totalPoints - currentTotalProcessed;
          const remainingSeconds = pointsPerSecond > 0 ? remainingPoints / pointsPerSecond : 0;
          let etaString = 'Calculating...';
          if (remainingSeconds < 60) {
            etaString = `${Math.round(remainingSeconds)} seconds`;
          } else if (remainingSeconds < 3600) {
            etaString = `${Math.round(remainingSeconds / 60)} minutes`;
          } else {
            etaString = `${Math.round(remainingSeconds / 3600)} hours`;
          }
          await JobQueueService.updateJobProgress(jobId, progress, {
            totalProcessed: currentTotalProcessed,
            totalSuccess: success,
            totalErrors: errors,
            totalPoints,
            currentBatch: Math.ceil(currentTotalProcessed / 1000),
            totalBatches: Math.ceil(totalPoints / 1000),
            message: `Processed ${currentTotalProcessed.toLocaleString()}/${totalPoints.toLocaleString()} points (${errors} errors)`,
            estimatedTimeRemaining: etaString
          });
        }
      }

      // Small delay between chunks to be respectful to the API
      if (i + concurrency < points.length) {
        await this.delay(50); // 50ms delay between chunks
      }
    }

    return { processed, success, errors };
  }

  private static async processSinglePoint(point: {
    user_id: string;
    location: string | { type: string; coordinates: number[]; crs?: { type: string; properties: { name: string } } };
    reverse_geocode: unknown;
    recorded_at: string;
  }): Promise<boolean> {
    try {
      // Extract lat/lon from GeoJSON point
      let lat: number, lon: number;

      if (point.location && typeof point.location === 'object' && 'coordinates' in point.location) {
        // GeoJSON format: { type: "Point", coordinates: [lon, lat] }
        const coords = point.location.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          [lon, lat] = coords;
        } else {
          console.warn(`⚠️ Invalid coordinates format for tracker data point:`, point.location);
          return false;
        }
      } else if (typeof point.location === 'string') {
        // PostGIS POINT format: "POINT(lon lat)"
          const locationMatch = point.location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
          if (!locationMatch) {
          console.warn(`⚠️ Invalid location format for tracker data point: ${point.location}`);
          return false;
        }
        [lon, lat] = locationMatch.slice(1).map(Number);
      } else {
        console.warn(`⚠️ Unknown location format for tracker data point:`, point.location);
        return false;
      }

      // Validate coordinates
      if (typeof lat !== 'number' || typeof lon !== 'number' ||
          isNaN(lat) || isNaN(lon) ||
          lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        console.warn(`⚠️ Invalid coordinates for tracker data point: lat=${lat}, lon=${lon}`);
        return false;
      }

          // Call Nominatim
          const geocodeResult = await reverseGeocode(lat, lon);

      // Update the tracker_data table with the geocoding result
      const { error: updateError } = await supabase
        .from('tracker_data')
        .update({
          reverse_geocode: geocodeResult,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', point.user_id)
        .eq('recorded_at', point.recorded_at);

      if (updateError) {
        console.error(`❌ Database update error:`, updateError);
        return false;
      }

      console.log(`✅ Geocoded tracker data point: ${geocodeResult.display_name}`);
      return true;

    } catch (error: unknown) {
      console.error(`❌ Error processing tracker data point:`, (error as Error).message);
      return false;
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static calculateEstimatedTimeRemaining(
    processed: number,
    totalPoints: number,
    processedInLastBatch: number,
    concurrency: number
  ): string {
    if (processed === 0 || processedInLastBatch === 0) {
      return 'Calculating...';
    }

    const remainingPoints = totalPoints - processed;
    const pointsPerSecond = (processedInLastBatch * concurrency) / 0.05; // 50ms per batch = 0.05 seconds
    const remainingSeconds = remainingPoints / pointsPerSecond;

    if (remainingSeconds < 60) {
      return `${Math.round(remainingSeconds)} seconds`;
    } else if (remainingSeconds < 3600) {
      return `${Math.round(remainingSeconds / 60)} minutes`;
    } else {
      return `${Math.round(remainingSeconds / 3600)} hours`;
    }
  }

  private static async processTripCoverGeneration(job: Job): Promise<void> {
    console.log(`🖼️ Processing trip cover generation job ${job.id}`);
    // Implementation would go here
  }

  private static async processStatisticsUpdate(job: Job): Promise<void> {
    console.log(`📊 Processing statistics update job ${job.id}`);
    // Implementation would go here
  }

  private static async processDataImport(job: Job): Promise<void> {
    console.log(`📥 Processing data import job ${job.id}`);
    // Implementation would go here
  }
}