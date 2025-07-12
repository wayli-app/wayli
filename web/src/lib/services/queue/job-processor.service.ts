import type { Job, JobType } from '$lib/types/job-queue.types';
import type { TripGenerationData, TripExclusion, TrackerDataPoint, DetectedTrip, HomeAddress } from '$lib/types/trip-generation.types';
import { reverseGeocode } from '../external/nominatim.service';
import { supabase } from '$lib/core/supabase/worker';
import { JobQueueService } from './job-queue.service.worker';
import { EnhancedPoiDetectionService } from '../enhanced-poi-detection.service';
import { TripLocationsService } from '../../services/trip-locations.service';
import { haversineDistance } from '../../utils';
import { getCountryForPoint, normalizeCountryCode } from '../external/country-reverse-geocoding.service';

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
      'poi_visit_detection': this.processPoiVisitDetection.bind(this),
      'trip_generation': this.processTripGeneration.bind(this)
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

    private static async processTripGeneration(job: Job): Promise<void> {
    console.log(`🗺️ Processing trip generation job ${job.id}`);

    const startTime = Date.now();
    const userId = job.created_by;
    const { startDate, endDate, useCustomHomeAddress, customHomeAddress } = job.data as unknown as TripGenerationData;

    try {
      // Check for cancellation before starting
      await this.checkJobCancellation(job.id);

      // Update job progress
      await JobQueueService.updateJobProgress(job.id, 5, {
        message: 'Starting trip generation analysis...',
        startDate,
        endDate
      });

      // Get user's home address
      let homeAddress = null;
      if (useCustomHomeAddress && customHomeAddress) {
        homeAddress = customHomeAddress;
      } else {
        // Get user's stored home address from metadata
        const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
        if (userError) throw userError;

        homeAddress = user.user?.user_metadata?.home_address;
      }

      await JobQueueService.updateJobProgress(job.id, 10, {
        message: 'Retrieved home address, fetching GPS data...',
        homeAddress: homeAddress ? 'configured' : 'not configured'
      });

      // Fetch GPS data for the date range
      const { data: trackerData, error: trackerError } = await supabase
        .from('tracker_data')
        .select('*')
        .eq('user_id', userId)
        .gte('recorded_at', `${startDate}T00:00:00Z`)
        .lte('recorded_at', `${endDate}T23:59:59Z`)
        .order('recorded_at', { ascending: true });

      if (trackerError) throw trackerError;

      await JobQueueService.updateJobProgress(job.id, 20, {
        message: `Fetched ${trackerData?.length || 0} GPS data points`,
        dataPoints: trackerData?.length || 0
      });

      if (!trackerData || trackerData.length === 0) {
        await JobQueueService.updateJobProgress(job.id, 100, {
          message: 'No GPS data found for the specified date range',
          tripsGenerated: 0
        });
        return;
      }

      // Get user's trip exclusions from metadata
      const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);

      if (userError || !user.user) throw userError || new Error('User not found');

      const exclusions = user.user.user_metadata?.trip_exclusions || [];

      await JobQueueService.updateJobProgress(job.id, 30, {
        message: 'Retrieved trip exclusions, analyzing data...',
        exclusionsCount: exclusions?.length || 0
      });

      // Analyze GPS data to detect trips
      const trips = await this.analyzeTripsFromGPSData(
        trackerData,
        homeAddress,
        exclusions || []
      );

      await JobQueueService.updateJobProgress(job.id, 80, {
        message: `Detected ${trips.length} potential trips, generating banners...`,
        tripsDetected: trips.length
      });

      // Generate banner images for trips
      const tripsWithBanners = await this.generateTripBanners(trips);

      await JobQueueService.updateJobProgress(job.id, 90, {
        message: 'Saving trips to database...',
        tripsWithBanners: tripsWithBanners.length
      });

      // Save trips to database
      const savedTrips = await this.saveTripsToDatabase(tripsWithBanners, userId, job.id);

      const totalTime = Date.now() - startTime;
      console.log(`✅ Trip generation completed: ${savedTrips.length} trips generated in ${totalTime}ms`);

      await JobQueueService.updateJobProgress(job.id, 100, {
        message: `Successfully generated ${savedTrips.length} trips`,
        tripsGenerated: savedTrips.length,
        totalTime: `${Math.round(totalTime / 1000)}s`
      });

    } catch (error: unknown) {
      // Check if the error is due to cancellation
      if (error instanceof Error && error.message === 'Job was cancelled') {
        console.log(`🛑 Trip generation job ${job.id} was cancelled`);
        return;
      }
      console.error(`❌ Error in trip generation job:`, error);
      throw error;
    }
  }

  private static async processDataImport(job: Job): Promise<void> {
    console.log(`📥 Processing data import job ${job.id}`);

    const startTime = Date.now();
    const userId = job.created_by;

    try {
      // Check for cancellation before starting
      await this.checkJobCancellation(job.id);

      // Extract job data
      const { storagePath, format, fileName } = job.data as {
        storagePath: string;
        format: string;
        fileName: string;
      };

      if (!storagePath || !format) {
        throw new Error('Missing storage path or format in job data');
      }

      // Download file content from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('temp-files')
        .download(storagePath);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file from storage: ${downloadError?.message || 'Unknown error'}`);
      }

      // Convert blob to text
      const fileContent = await fileData.text();

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

      // Clean up temporary file from storage after successful processing
      await supabase.storage
        .from('temp-files')
        .remove([storagePath]);

      console.log(`✅ Data import completed: ${importedCount} items imported in ${elapsedSeconds.toFixed(1)}s`);

    } catch (error: unknown) {
      // Check if the error is due to cancellation
      if (error instanceof Error && error.message === 'Job was cancelled') {
        console.log(`🛑 Data import job ${job.id} was cancelled`);
        // Clean up temporary file on cancellation
        try {
          const { storagePath } = job.data as { storagePath: string };
          if (storagePath) {
            await supabase.storage
              .from('temp-files')
              .remove([storagePath]);
          }
        } catch (cleanupError) {
          console.error('Failed to cleanup temporary file on cancellation:', cleanupError);
        }
        return;
      }
      console.error(`❌ Error in data import job:`, error);
      // Clean up temporary file on error as well
      try {
        const { storagePath } = job.data as { storagePath: string };
        if (storagePath) {
          await supabase.storage
            .from('temp-files')
            .remove([storagePath]);
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

          // NEW: Log every 1,000 imported points
          if (importedCount > 0 && importedCount % 1000 === 0) {
            await JobQueueService.updateJobProgress(jobId, Math.round((i / geojson.features.length) * 100), {
              message: `Imported ${importedCount.toLocaleString()} / ${totalFeatures.toLocaleString()} points...`,
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

            // Extract timestamp from properties - handle both seconds and milliseconds
            let recordedAt = new Date().toISOString();
            if (properties.timestamp) {
              // Check if timestamp is in seconds (Unix timestamp) or milliseconds
              const timestamp = properties.timestamp;
              if (timestamp < 10000000000) {
                // Timestamp is in seconds, convert to milliseconds
                recordedAt = new Date(timestamp * 1000).toISOString();
              } else {
                // Timestamp is already in milliseconds
                recordedAt = new Date(timestamp).toISOString();
              }
            } else if (properties.time) {
              recordedAt = new Date(properties.time).toISOString();
            } else if (properties.date) {
              recordedAt = new Date(properties.date).toISOString();
            }

                        // Extract country code from properties first, then from coordinates if not available
            let countryCode = properties.countrycode || properties.country_code || properties.country || null;

            // If no country code in properties, determine it from coordinates
            if (!countryCode) {
              countryCode = this.getCountryForPoint(latitude, longitude);
            }

            // Normalize the country code to ensure it's a valid 2-character ISO code
            countryCode = this.normalizeCountryCode(countryCode);

            // Use geodata for reverse_geocode if available
            let reverseGeocode = null;
            if (properties.geodata) {
              reverseGeocode = properties.geodata;
            }

            const { error } = await supabase
              .from('tracker_data')
              .upsert({
                user_id: userId,
                tracker_type: 'import',
                location: `POINT(${longitude} ${latitude})`,
                recorded_at: recordedAt,
                country_code: countryCode,
                reverse_geocode: reverseGeocode,
                altitude: properties.altitude || properties.elevation || null,
                accuracy: properties.accuracy || null,
                speed: properties.speed || properties.velocity || null,
                heading: properties.heading || properties.bearing || properties.course || null,
                activity_type: properties.activity_type || null,
                raw_data: { ...properties, import_source: 'geojson' }, // Store all original properties plus import source
                created_at: new Date().toISOString()
              }, {
                onConflict: 'user_id,location,recorded_at',
                ignoreDuplicates: false
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
          // Determine country code from coordinates
          const countryCode = await this.normalizeCountryCode(this.getCountryForPoint(lat, lon));

          const { error } = await supabase
            .from('tracker_data')
            .upsert({
              user_id: userId,
              tracker_type: 'import',
              location: `POINT(${lon} ${lat})`,
              recorded_at: waypoint.time || new Date().toISOString(),
              country_code: countryCode,
              raw_data: {
                name: waypoint.name || `GPX Waypoint ${i + 1}`,
                description: waypoint.desc || `Imported from ${fileName}`,
                category: 'waypoint',
                import_source: 'gpx',
                data_type: 'waypoint'
              },
              created_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,location,recorded_at',
              ignoreDuplicates: false
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
            // Determine country code from coordinates
            const countryCode = this.normalizeCountryCode(this.getCountryForPoint(lat, lon));

            const { error } = await supabase
              .from('tracker_data')
              .upsert({
                user_id: userId,
                tracker_type: 'import',
                location: `POINT(${lon} ${lat})`,
                recorded_at: point.time || new Date().toISOString(),
                country_code: countryCode,
                raw_data: {
                  import_source: 'gpx',
                  data_type: 'track_point'
                },
                created_at: new Date().toISOString()
              }, {
                onConflict: 'user_id,location,recorded_at',
                ignoreDuplicates: false
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
            // Determine country code from coordinates
            const countryCode = this.normalizeCountryCode(this.getCountryForPoint(lat, lon));

            const { error } = await supabase
              .from('tracker_data')
              .upsert({
                user_id: userId,
                tracker_type: 'import',
                location: `POINT(${lon} ${lat})`,
                recorded_at: new Date(timestamp * 1000).toISOString(),
                country_code: countryCode,
                raw_data: {
                  import_source: 'owntracks',
                  data_type: 'track_point'
                },
                created_at: new Date().toISOString()
              }, {
                onConflict: 'user_id,location,recorded_at',
                ignoreDuplicates: false
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

  private static getCountryForPoint(lat: number, lon: number): string | null {
    try {
      return getCountryForPoint(lat, lon);
    } catch (error) {
      console.warn('Failed to get country for point:', error);
      return null;
    }
  }

  private static normalizeCountryCode(countryCode: string | null): string | null {
    try {
      return normalizeCountryCode(countryCode);
    } catch (error) {
      console.warn('Failed to normalize country code:', error);
      return null;
    }
  }

  private static async processPoiVisitDetection(job: Job): Promise<void> {
    console.log(`📍 Processing POI visit detection job ${job.id}`);

    const startTime = Date.now();
    const enhancedPoiService = new EnhancedPoiDetectionService();

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

        const userResult = await enhancedPoiService.detectVisitsForUser(targetUserId, config);

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

        // For automatic POI detection, we need to process users individually
        // since we don't have a separate POI table to query
        const { data: users, error: usersError } = await supabase
          .from('tracker_data')
          .select('user_id')
          .not('reverse_geocode', 'is', null);

        if (usersError) throw usersError;

        const uniqueUserIds = [...new Set(users.map(u => u.user_id))];
        const allUsersResults = [];

        for (const userId of uniqueUserIds) {
          try {
            const result = await enhancedPoiService.detectVisitsForUser(userId, config);
            allUsersResults.push({
              userId,
              visits: result.visits,
              totalDetected: result.totalDetected
            });
          } catch (error) {
            console.error(`Error detecting visits for user ${userId}:`, error);
            allUsersResults.push({
              userId,
              visits: [],
              totalDetected: 0
            });
          }
        }

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

  // Trip Generation Helper Methods

    private static async analyzeTripsFromGPSData(
    trackerData: TrackerDataPoint[],
    homeAddress: HomeAddress | null,
    exclusions: TripExclusion[]
  ): Promise<DetectedTrip[]> {
    const trips: DetectedTrip[] = [];
    const HOME_RADIUS_KM = 50; // Consider within 50km as "home"

    // Group data points by day
    const dailyGroups = this.groupDataByDay(trackerData);

    // Analyze each day to detect overnight stays
    for (const [date, dayData] of Object.entries(dailyGroups)) {
      if (dayData.length === 0) continue;

      // Check if user was away from home for an extended period
      const isAwayFromHome = this.isAwayFromHome(dayData, homeAddress, HOME_RADIUS_KM);

      if (isAwayFromHome) {
        // Check if this location is in the exclusion list
        const isExcluded = this.isLocationExcluded(dayData[0], exclusions);

        if (!isExcluded) {
          // This could be the start of a trip
          const trip = await this.createTripFromDayData(date, dayData);
          if (trip) {
            trips.push(trip);
          }
        }
      }
    }

    // Merge consecutive days into single trips
    return this.mergeConsecutiveTrips(trips);
  }

    private static groupDataByDay(trackerData: TrackerDataPoint[]): Record<string, TrackerDataPoint[]> {
    const groups: Record<string, TrackerDataPoint[]> = {};

    for (const point of trackerData) {
      const date = new Date(point.recorded_at).toISOString().split('T')[0];
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(point);
    }

    return groups;
  }

  private static isAwayFromHome(dayData: TrackerDataPoint[], homeAddress: HomeAddress | null, radiusKm: number): boolean {
    if (!homeAddress || !homeAddress.coordinates) {
      // If no home address, assume user is always "away"
      return true;
    }

    const homeLat = homeAddress.coordinates.lat;
    const homeLng = homeAddress.coordinates.lng;

    // Check if any point in the day is away from home
    for (const point of dayData) {
      if (point.location && point.location.coordinates) {
        const distance = this.calculateDistance(
          homeLat, homeLng,
          point.location.coordinates[1], // lat
          point.location.coordinates[0]  // lng
        );

        if (distance > radiusKm) {
          return true;
        }
      }
    }

    return false;
  }

  private static isLocationExcluded(point: TrackerDataPoint, exclusions: TripExclusion[]): boolean {
    if (!point.location || !point.location.coordinates) return false;

    for (const exclusion of exclusions) {
      if (exclusion.location && exclusion.location.coordinates) {
        const distance = this.calculateDistance(
          point.location.coordinates[1], // lat
          point.location.coordinates[0], // lng
          exclusion.location.coordinates.lat,
          exclusion.location.coordinates.lng
        );

        // If within 10km of exclusion, consider it excluded
        if (distance < 10) {
          return true;
        }
      }
    }

    return false;
  }

  private static async createTripFromDayData(date: string, dayData: TrackerDataPoint[]): Promise<DetectedTrip | null> {
    if (dayData.length === 0) return null;

    // Get the most common location for this day
    const location = this.getMostCommonLocation(dayData);
    if (!location) return null;

    // Try to get city name from reverse geocoding
    let cityName = 'Unknown Location';
    try {
      const geocodeResult = await reverseGeocode(location.coordinates[1], location.coordinates[0]);
      if (geocodeResult && geocodeResult.address) {
        cityName = geocodeResult.address.city ||
                  geocodeResult.address.town ||
                  geocodeResult.address.village ||
                  'Unknown Location';
      }
    } catch (error) {
      console.warn('Failed to reverse geocode location:', error);
    }

    return {
      startDate: date,
      endDate: date,
      title: `Trip to ${cityName}`,
      description: `Automatically generated trip to ${cityName}`,
      location: location,
      cityName: cityName
    };
  }

  private static getMostCommonLocation(dayData: TrackerDataPoint[]): { type: string; coordinates: number[] } | null {
    // Simple implementation: return the first valid location
    for (const point of dayData) {
      if (point.location && point.location.coordinates) {
        return point.location;
      }
    }
    return null;
  }

  private static mergeConsecutiveTrips(trips: DetectedTrip[]): DetectedTrip[] {
    if (trips.length <= 1) return trips;

    const merged: DetectedTrip[] = [];
    let currentTrip = { ...trips[0] };

    for (let i = 1; i < trips.length; i++) {
      const nextTrip = trips[i];
      const currentEnd = new Date(currentTrip.endDate);
      const nextStart = new Date(nextTrip.startDate);

      // Check if trips are consecutive (within 1 day)
      const dayDiff = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60 * 60 * 24);

      if (dayDiff <= 1 && currentTrip.cityName === nextTrip.cityName) {
        // Merge trips
        currentTrip.endDate = nextTrip.endDate;
        currentTrip.title = `Trip to ${currentTrip.cityName}`;
      } else {
        // End current trip and start new one
        merged.push(currentTrip);
        currentTrip = { ...nextTrip };
      }
    }

    merged.push(currentTrip);
    return merged;
  }

  private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private static deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

    private static async generateTripBanners(trips: DetectedTrip[]): Promise<DetectedTrip[]> {
    const tripsWithBanners = [...trips];

    // Get unique city names
    const cities = [...new Set(trips.map(trip => trip.cityName))];

    // Fetch banner images for cities
    const { getMultipleTripBannerImages } = await import('../external/unsplash.service');
    const bannerImages = await getMultipleTripBannerImages(cities);

    // Assign banner images to trips
    for (const trip of tripsWithBanners) {
      trip.image_url = bannerImages[trip.cityName] || undefined;
    }

    return tripsWithBanners;
  }

  private static async saveTripsToDatabase(trips: DetectedTrip[], userId: string, jobId: string): Promise<unknown[]> {
    const savedTrips = [];
    const tripLocationsService = new TripLocationsService();

    for (const trip of trips) {
      const { data: savedTrip, error } = await supabase
        .from('trips')
        .insert({
          user_id: userId,
          title: trip.title,
          description: trip.description,
          start_date: trip.startDate,
          end_date: trip.endDate,
          image_url: trip.image_url,
          labels: ['auto-generated'],
          metadata: {
            distance_traveled: 0, // Will be calculated from tracker data
            visited_places_count: 1, // At least the destination city
            cityName: trip.cityName,
            location: trip.location,
            jobId: jobId
          }
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving trip:', error);
      } else if (savedTrip && savedTrip.id) {
        // --- Calculate geopoints and distance, then update metadata ---
        try {
          const points = await tripLocationsService.getTripLocations(savedTrip.id);
          const pointCount = points.length;
          let distance = 0;
          for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1].location.coordinates;
            const curr = points[i].location.coordinates;
            distance += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
          }
          await supabase
            .from('trips')
            .update({ metadata: { ...savedTrip.metadata, point_count: pointCount, distance_traveled: distance } })
            .eq('id', savedTrip.id);
        } catch (err) {
          console.error('Error updating trip metadata (auto-generated):', err);
        }
        savedTrips.push(savedTrip);
      }
    }

    return savedTrips;
  }
}