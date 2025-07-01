import type { Job, JobType } from '$lib/types/job-queue.types';
import { reverseGeocode } from '../external/nominatim.service';
import { supabase } from '$lib/core/supabase/worker';
import { JobQueueService } from './job-queue.service.worker';
import { PoiVisitDetectionService } from '../poi-visit-detection.service';

export class JobProcessorService {
  /**
   * Check if a job has been cancelled
   */
  private static async isJobCancelled(jobId: string): Promise<boolean> {
    const { data: job, error } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      console.error('Error checking job status:', error);
      return false;
    }

    return job.status === 'cancelled';
  }

  /**
   * Throw an error if the job has been cancelled
   */
  private static async checkJobCancellation(jobId: string): Promise<void> {
    if (await this.isJobCancelled(jobId)) {
      throw new Error('Job was cancelled');
    }
  }

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
      'data_import': this.processDataImport.bind(this),
      'poi_visit_detection': this.processPoiVisitDetection.bind(this)
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
      // Check for cancellation before starting
      await this.checkJobCancellation(job.id);

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
      // Check if the error is due to cancellation
      if (error instanceof Error && error.message === 'Job was cancelled') {
        console.log(`🛑 Reverse geocoding job ${job.id} was cancelled`);
        return;
      }
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
      // Check for cancellation before processing each batch
      await this.checkJobCancellation(jobId);

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

  private static async processDataImport(job: Job): Promise<void> {
    console.log(`📥 Processing data import job ${job.id}`);

    const startTime = Date.now();
    const userId = job.created_by;

    try {
      // Check for cancellation before starting
      await this.checkJobCancellation(job.id);

      // Extract job data
      const { tempFileId, format, fileName } = job.data as {
        tempFileId: string;
        format: string;
        fileName: string;
      };

      if (!tempFileId || !format) {
        throw new Error('Missing temp file ID or format in job data');
      }

      // Fetch file content from temp_files table
      const { data: tempFile, error: tempFileError } = await supabase
        .from('temp_files')
        .select('file_content')
        .eq('id', tempFileId)
        .single();

      if (tempFileError || !tempFile) {
        throw new Error('Failed to fetch temporary file content');
      }

      const fileContent = tempFile.file_content;

      console.log(`📁 Processing import: ${fileName}, format: ${format}, content length: ${fileContent.length}`);

      // Update initial progress
      await JobQueueService.updateJobProgress(job.id, 0, {
        message: `Starting ${format} import...`,
        fileName,
        format,
        totalProcessed: 0,
        totalItems: 0
      });

      let importedCount = 0;
      let totalItems = 0;

      // Process based on format
      switch (format) {
        case 'GeoJSON':
          importedCount = await this.importGeoJSONWithProgress(fileContent, userId, job.id, fileName);
          break;
        case 'GPX': {
          const result = await this.importGPXWithProgress(fileContent, userId, job.id, fileName);
          importedCount = result.importedCount;
          totalItems = result.totalItems;
          break;
        }
        case 'OwnTracks':
          importedCount = await this.importOwnTracksWithProgress(fileContent, userId, job.id, fileName);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Update final progress
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      await JobQueueService.updateJobProgress(job.id, 100, {
        message: `✅ Import completed successfully!`,
        fileName,
        format,
        totalProcessed: importedCount,
        totalItems: totalItems || importedCount,
        importedCount,
        elapsedSeconds: elapsedSeconds.toFixed(1)
      });

      // Clean up temporary file after successful processing
      await supabase
        .from('temp_files')
        .delete()
        .eq('id', tempFileId);

      console.log(`✅ Data import completed: ${importedCount} items imported in ${elapsedSeconds.toFixed(1)}s`);

    } catch (error: unknown) {
      // Check if the error is due to cancellation
      if (error instanceof Error && error.message === 'Job was cancelled') {
        console.log(`🛑 Data import job ${job.id} was cancelled`);
        // Clean up temporary file on cancellation
        try {
          const { tempFileId } = job.data as { tempFileId: string };
          if (tempFileId) {
            await supabase
              .from('temp_files')
              .delete()
              .eq('id', tempFileId);
          }
        } catch (cleanupError) {
          console.error('Failed to cleanup temporary file on cancellation:', cleanupError);
        }
        return;
      }
      console.error(`❌ Error in data import job:`, error);
      // Clean up temporary file on error as well
      try {
        const { tempFileId } = job.data as { tempFileId: string };
        if (tempFileId) {
          await supabase
            .from('temp_files')
            .delete()
            .eq('id', tempFileId);
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup temporary file:', cleanupError);
      }
      throw error;
    }
  }

  private static async importGeoJSONWithProgress(content: string, userId: string, jobId: string, fileName: string): Promise<number> {
    try {
      console.log('Starting GeoJSON import with progress tracking');
      const geojson = JSON.parse(content);
      let importedCount = 0;

      if (geojson.type === 'FeatureCollection' && geojson.features) {
        const totalFeatures = geojson.features.length;
        console.log(`Processing ${totalFeatures} features`);

        // Update progress with total items
        await JobQueueService.updateJobProgress(jobId, 0, {
          message: `Processing ${totalFeatures} GeoJSON features...`,
          fileName,
          format: 'GeoJSON',
          totalProcessed: 0,
          totalItems: totalFeatures
        });

        for (let i = 0; i < geojson.features.length; i++) {
          // Check for cancellation every 10 features
          if (i % 10 === 0) {
            await this.checkJobCancellation(jobId);
          }

          const feature = geojson.features[i];

          // Update progress every 10 features or at the end
          if (i % 10 === 0 || i === geojson.features.length - 1) {
            const progress = Math.round((i / geojson.features.length) * 100);
            await JobQueueService.updateJobProgress(jobId, progress, {
              message: `Processing GeoJSON features... ${i + 1}/${totalFeatures}`,
              fileName,
              format: 'GeoJSON',
              totalProcessed: importedCount,
              totalItems: totalFeatures,
              currentFeature: i + 1
            });
          }

          if (feature.geometry?.type === 'Point' && feature.geometry.coordinates) {
            const [longitude, latitude] = feature.geometry.coordinates;
            const properties = feature.properties || {};

            // Get country code
            const countryCode = await this.getCountryForPoint(latitude, longitude);

            const { error } = await supabase
              .from('points_of_interest')
              .insert({
                user_id: userId,
                location: `POINT(${longitude} ${latitude})`,
                name: properties.name || `Imported Point ${i + 1}`,
                description: properties.description || `Imported from ${fileName}`,
                country_code: countryCode,
                created_at: new Date().toISOString()
              });

            if (!error) {
              importedCount++;
            } else {
              console.error(`Error inserting feature ${i}:`, error);
            }
          }
        }
      }

      return importedCount;
    } catch (error) {
      // Check if the error is due to cancellation
      if (error instanceof Error && error.message === 'Job was cancelled') {
        console.log(`🛑 GeoJSON import was cancelled`);
        return 0;
      }
      console.error('Error in GeoJSON import:', error);
      throw error;
    }
  }

  private static async importGPXWithProgress(content: string, userId: string, jobId: string, fileName: string): Promise<{ importedCount: number; totalItems: number }> {
    try {
      console.log('Starting GPX import with progress tracking');

      // Parse GPX content
      const parser = new (await import('fast-xml-parser')).XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_'
      });

      const gpxData = parser.parse(content);
      const tracks = gpxData.gpx?.trk || [];
      const waypoints = gpxData.gpx?.wpt || [];

      const totalItems = tracks.length + waypoints.length;
      let importedCount = 0;

      await JobQueueService.updateJobProgress(jobId, 0, {
        message: `Processing ${totalItems} GPX items...`,
        fileName,
        format: 'GPX',
        totalProcessed: 0,
        totalItems
      });

      // Process waypoints
      for (let i = 0; i < waypoints.length; i++) {
        // Check for cancellation every 5 waypoints
        if (i % 5 === 0) {
          await this.checkJobCancellation(jobId);
        }

        const waypoint = waypoints[i];
        const lat = parseFloat(waypoint['@_lat']);
        const lon = parseFloat(waypoint['@_lon']);

        if (!isNaN(lat) && !isNaN(lon)) {
          const countryCode = await this.getCountryForPoint(lat, lon);

          const { error } = await supabase
            .from('points_of_interest')
            .insert({
              user_id: userId,
              location: `POINT(${lon} ${lat})`,
              name: waypoint.name || `GPX Waypoint ${i + 1}`,
              description: waypoint.desc || `Imported from ${fileName}`,
              country_code: countryCode,
              created_at: new Date().toISOString()
            });

          if (!error) {
            importedCount++;
          }
        }

        // Update progress every 5 waypoints
        if (i % 5 === 0 || i === waypoints.length - 1) {
          const progress = Math.round((i / totalItems) * 100);
          await JobQueueService.updateJobProgress(jobId, progress, {
            message: `Processing GPX waypoints... ${i + 1}/${waypoints.length}`,
            fileName,
            format: 'GPX',
            totalProcessed: importedCount,
            totalItems
          });
        }
      }

      // Process tracks
      for (let i = 0; i < tracks.length; i++) {
        // Check for cancellation before processing each track
        await this.checkJobCancellation(jobId);

        const track = tracks[i];
        const trackPoints = track.trkseg?.trkpt || [];

        for (let j = 0; j < trackPoints.length; j++) {
          const point = trackPoints[j];
          const lat = parseFloat(point['@_lat']);
          const lon = parseFloat(point['@_lon']);

          if (!isNaN(lat) && !isNaN(lon)) {
            const countryCode = await this.getCountryForPoint(lat, lon);

            const { error } = await supabase
              .from('tracker_data')
              .insert({
                user_id: userId,
                location: `POINT(${lon} ${lat})`,
                recorded_at: point.time || new Date().toISOString(),
                country_code: countryCode,
                created_at: new Date().toISOString()
              });

            if (!error) {
              importedCount++;
            }
          }
        }

        // Update progress every track
        const progress = Math.round(((waypoints.length + i + 1) / totalItems) * 100);
        await JobQueueService.updateJobProgress(jobId, progress, {
          message: `Processing GPX tracks... ${i + 1}/${tracks.length}`,
          fileName,
          format: 'GPX',
          totalProcessed: importedCount,
          totalItems
        });
      }

      return { importedCount, totalItems };
    } catch (error) {
      // Check if the error is due to cancellation
      if (error instanceof Error && error.message === 'Job was cancelled') {
        console.log(`🛑 GPX import was cancelled`);
        return { importedCount: 0, totalItems: 0 };
      }
      console.error('Error in GPX import:', error);
      throw error;
    }
  }

  private static async importOwnTracksWithProgress(content: string, userId: string, jobId: string, fileName: string): Promise<number> {
    try {
      console.log('Starting OwnTracks import with progress tracking');

      const lines = content.split('\n').filter(line => line.trim());
      const totalLines = lines.length;
      let importedCount = 0;

      await JobQueueService.updateJobProgress(jobId, 0, {
        message: `Processing ${totalLines} OwnTracks lines...`,
        fileName,
        format: 'OwnTracks',
        totalProcessed: 0,
        totalItems: totalLines
      });

      for (let i = 0; i < lines.length; i++) {
        // Check for cancellation every 100 lines
        if (i % 100 === 0) {
          await this.checkJobCancellation(jobId);
        }

        const line = lines[i].trim();
        if (!line) continue;

        // Parse OwnTracks format: timestamp,lat,lon,altitude,accuracy,vertical_accuracy,velocity,heading,event
        const parts = line.split(',');
        if (parts.length >= 3) {
          const timestamp = parseInt(parts[0]);
          const lat = parseFloat(parts[1]);
          const lon = parseFloat(parts[2]);

          if (!isNaN(timestamp) && !isNaN(lat) && !isNaN(lon)) {
            const countryCode = await this.getCountryForPoint(lat, lon);

            const { error } = await supabase
              .from('tracker_data')
              .insert({
                user_id: userId,
                location: `POINT(${lon} ${lat})`,
                recorded_at: new Date(timestamp * 1000).toISOString(),
                country_code: countryCode,
                created_at: new Date().toISOString()
              });

            if (!error) {
              importedCount++;
            }
          }
        }

        // Update progress every 100 lines
        if (i % 100 === 0 || i === lines.length - 1) {
          const progress = Math.round((i / totalLines) * 100);
          await JobQueueService.updateJobProgress(jobId, progress, {
            message: `Processing OwnTracks data... ${i + 1}/${totalLines}`,
            fileName,
            format: 'OwnTracks',
            totalProcessed: importedCount,
            totalItems: totalLines
          });
        }
      }

      return importedCount;
    } catch (error) {
      // Check if the error is due to cancellation
      if (error instanceof Error && error.message === 'Job was cancelled') {
        console.log(`🛑 OwnTracks import was cancelled`);
        return 0;
      }
      console.error('Error in OwnTracks import:', error);
      throw error;
    }
  }

  private static async getCountryForPoint(lat: number, lon: number): Promise<string | null> {
    try {
      // Import the country reverse geocoding service
      const { getCountryForPoint } = await import('$lib/services/external/country-reverse-geocoding.service');
      return getCountryForPoint(lat, lon);
    } catch (error) {
      console.warn('Failed to get country for point:', error);
      return null;
    }
  }

  private static async processPoiVisitDetection(job: Job): Promise<void> {
    console.log(`📍 Processing POI visit detection job ${job.id}`);

    const startTime = Date.now();
    const poiService = new PoiVisitDetectionService();

    try {
      // Check for cancellation before starting
      await this.checkJobCancellation(job.id);

      // Update job progress to started
      await JobQueueService.updateJobProgress(job.id, 0, {
        message: 'Starting POI visit detection...',
        totalProcessed: 0,
        totalDetected: 0
      });

      // Get configuration from job data or use defaults
      const config = {
        minDwellMinutes: (job.data.minDwellMinutes as number) || 15,
        maxDistanceMeters: (job.data.maxDistanceMeters as number) || 100,
        minConsecutivePoints: (job.data.minConsecutivePoints as number) || 3,
        lookbackDays: (job.data.lookbackDays as number) || 7
      };

      // Check if this is for a specific user or all users
      const targetUserId = job.data.userId as string;

      if (targetUserId) {
        // Process for specific user
        await JobQueueService.updateJobProgress(job.id, 25, {
          message: `Detecting visits for user ${targetUserId}...`,
          totalProcessed: 0,
          totalDetected: 0
        });

        // Check for cancellation before processing user
        await this.checkJobCancellation(job.id);

        const userResult = await poiService.detectVisitsForUser(targetUserId, config);

        await JobQueueService.updateJobProgress(job.id, 75, {
          message: `Found ${userResult.totalDetected} visits for user`,
          totalProcessed: 1,
          totalDetected: userResult.totalDetected
        });

        // Complete the job
        const elapsedSeconds = (Date.now() - startTime) / 1000;

        await JobQueueService.updateJobProgress(job.id, 100, {
          message: `✅ POI visit detection completed for user ${targetUserId}`,
          totalProcessed: 1,
          totalDetected: userResult.totalDetected,
          elapsedSeconds: elapsedSeconds.toFixed(1)
        });

        console.log(`✅ POI visit detection completed in ${elapsedSeconds.toFixed(1)}s`);

      } else {
        // Process for all users
        await JobQueueService.updateJobProgress(job.id, 25, {
          message: 'Detecting visits for all users...',
          totalProcessed: 0,
          totalDetected: 0
        });

        // Check for cancellation before processing all users
        await this.checkJobCancellation(job.id);

        const allUsersResults = await poiService.detectVisitsForAllUsers(config);

        const totalDetected = allUsersResults.reduce((sum, r) => sum + r.totalDetected, 0);
        const totalUsers = allUsersResults.length;

        await JobQueueService.updateJobProgress(job.id, 75, {
          message: `Found ${totalDetected} visits across ${totalUsers} users`,
          totalProcessed: totalUsers,
          totalDetected: totalDetected
        });

        // Complete the job
        const elapsedSeconds = (Date.now() - startTime) / 1000;

        await JobQueueService.updateJobProgress(job.id, 100, {
          message: `✅ POI visit detection completed for all users`,
          totalProcessed: totalUsers,
          totalDetected: totalDetected,
          elapsedSeconds: elapsedSeconds.toFixed(1)
        });

        console.log(`✅ POI visit detection completed in ${elapsedSeconds.toFixed(1)}s`);
      }

    } catch (error: unknown) {
      // Check if the error is due to cancellation
      if (error instanceof Error && error.message === 'Job was cancelled') {
        console.log(`🛑 POI visit detection job ${job.id} was cancelled`);
        return;
      }
      console.error(`❌ Error in POI visit detection job:`, error);
      throw error;
    }
  }
}