import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	parseJsonBody,
	getQueryParams,
	logError,
	logInfo,
	logSuccess
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		if (req.method === 'GET') {
			const url = req.url;
			const params = getQueryParams(url);
			const limit = parseInt(params.get('limit') || '10');
			const offset = parseInt(params.get('offset') || '0');

			// Get suggested trips from trips table with status='pending', sorted by start_date descending
			const { data: suggestedTrips, error: tripsError } = await supabase
				.from('trips')
				.select('*')
				.eq('user_id', user.id)
				.eq('status', 'pending')
				.order('start_date', { ascending: false })
				.range(offset, offset + limit - 1);

			if (tripsError) {
				logError(tripsError, 'TRIPS-SUGGESTED');
				return errorResponse('Failed to fetch suggested trips', 500);
			}

			// Get total count of pending trips
			const { count: totalCount, error: countError } = await supabase
				.from('trips')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', user.id)
				.eq('status', 'pending');

			if (countError) {
				logError(countError, 'TRIPS-SUGGESTED');
				return errorResponse('Failed to count suggested trips', 500);
			}

			return successResponse({
				trips: suggestedTrips || [],
				total: totalCount || 0,
				limit,
				offset
			});
		}

		if (req.method === 'POST') {
			logInfo('Processing suggested trip', 'TRIPS-SUGGESTED', { userId: user.id });

			const body = await parseJsonBody<Record<string, unknown>>(req);
			const action = body.action as string;
			const tripIds = body.tripIds as string[];

			// Handle approve/reject actions
			if (action === 'approve' || action === 'reject') {
				logInfo(`Received ${action} request`, 'TRIPS-SUGGESTED', {
					userId: user.id,
					tripIds,
					tripCount: tripIds?.length || 0
				});

				if (!tripIds || !Array.isArray(tripIds) || tripIds.length === 0) {
					logError('Missing or invalid trip IDs', 'TRIPS-SUGGESTED', { tripIds });
					return errorResponse('Missing trip IDs', 400);
				}

				logInfo(`Processing ${action} action for ${tripIds.length} trips`, 'TRIPS-SUGGESTED', {
					userId: user.id,
					action,
					tripCount: tripIds.length,
					hasPreGeneratedImages: !!body.pre_generated_images,
					preGeneratedImagesKeys: body.pre_generated_images
						? Object.keys(body.pre_generated_images as Record<string, unknown>)
						: []
				});

				const results: Array<{
					id: string;
					success: boolean;
					error?: string;
					tripId?: string;
				}> = [];

				for (const tripId of tripIds) {
					logInfo(`Processing trip ID: ${tripId}`, 'TRIPS-SUGGESTED');

					// Get the suggested trip
					const { data: suggestedTrip, error: fetchError } = await supabase
						.from('trips')
						.select('*')
						.eq('id', tripId)
						.eq('user_id', user.id)
						.eq('status', 'pending')
						.single();

					if (fetchError || !suggestedTrip) {
						logError(fetchError, 'TRIPS-SUGGESTED');
						results.push({ id: tripId, success: false, error: 'Suggested trip not found' });
						continue;
					}

					// Check if we have pre-generated images for this trip
					const preGeneratedImages =
						(body.pre_generated_images as Record<
							string,
							{ image_url: string; attribution?: string }
						>) || {};
					const tripImageData = preGeneratedImages[tripId];

					logInfo(`Image data for trip ${tripId}:`, 'TRIPS-SUGGESTED', {
						hasImageData: !!tripImageData,
						imageUrl: tripImageData?.image_url,
						attribution: tripImageData?.attribution,
						preGeneratedImagesKeys: Object.keys(preGeneratedImages),
						preGeneratedImagesCount: Object.keys(preGeneratedImages).length
					});

					logInfo(`Found suggested trip: ${suggestedTrip.title}`, 'TRIPS-SUGGESTED');
					logInfo(`Suggested trip data:`, 'TRIPS-SUGGESTED', {
						title: suggestedTrip.title,
						metadata: suggestedTrip.metadata
					});

					logInfo(`Processing action: ${action} for trip: ${tripId}`, 'TRIPS-SUGGESTED');

					if (action === 'approve') {
						// Update the trip status to 'active' and add image data
						logInfo(`Approving trip: ${suggestedTrip.title}`, 'TRIPS-SUGGESTED');

						// Build metadata object with all updates
						const updatedMetadata: Record<string, unknown> = {
							...suggestedTrip.metadata,
							suggested: true,
							approved_at: new Date().toISOString()
						};

						// Add image attribution if available
						if (tripImageData?.image_url) {
							updatedMetadata.image_attribution = tripImageData.attribution || null;

							logInfo(`Image data for trip ${tripId}:`, 'TRIPS-SUGGESTED', {
								hasImageUrl: !!tripImageData.image_url,
								hasAttribution: !!tripImageData.attribution,
								attributionData: tripImageData.attribution
							});
						}

						// Calculate distance traveled if trip has dates
						// Using the same logic as updateTripMetadata in trips.service.ts
						let distanceTraveled = 0;
						if (suggestedTrip.start_date && suggestedTrip.end_date) {
							const { data, error } = await supabase
								.from('tracker_data')
								.select('distance')
								.eq('user_id', user.id)
								.gte('recorded_at', `${suggestedTrip.start_date}T00:00:00Z`)
								.lte('recorded_at', `${suggestedTrip.end_date}T23:59:59Z`)
								.not('country_code', 'is', null); // Ignore records with NULL country codes when calculating trip distance

							if (!error && data) {
								// Sum up all distances, treating null/undefined as 0
								distanceTraveled = data.reduce(
									(sum, row) => sum + (typeof row.distance === 'number' ? row.distance : 0),
									0
								);
							}

							updatedMetadata.distanceTraveled = distanceTraveled;

							logInfo(
								`Calculated distance for trip ${tripId}: ${distanceTraveled}`,
								'TRIPS-SUGGESTED'
							);
						}

						// Build the update data object
						const updateData: Record<string, unknown> = {
							status: 'active',
							metadata: updatedMetadata,
							updated_at: new Date().toISOString()
						};

						// Add image URL if available
						if (tripImageData?.image_url) {
							updateData.image_url = tripImageData.image_url;
						}

						const { data: updatedTrip, error: updateError } = await supabase
							.from('trips')
							.update(updateData)
							.eq('id', tripId)
							.select()
							.single();

						if (updateError) {
							logError(updateError, 'TRIPS-SUGGESTED');
							results.push({ id: tripId, success: false, error: 'Failed to approve trip' });
							continue;
						}

						logInfo(`Trip approved successfully: ${updatedTrip.id}`, 'TRIPS-SUGGESTED');
						results.push({ id: tripId, success: true, tripId: updatedTrip.id });
					} else if (action === 'reject') {
						// Update the trip status to 'rejected'
						logInfo(`Rejecting trip: ${suggestedTrip.title}`, 'TRIPS-SUGGESTED');

						const { data: updatedTrip, error: updateError } = await supabase
							.from('trips')
							.update({
								status: 'rejected',
								metadata: {
									...suggestedTrip.metadata,
									suggested: true,
									rejected_at: new Date().toISOString()
								}
							})
							.eq('id', tripId)
							.select()
							.single();

						if (updateError) {
							logError(updateError, 'TRIPS-SUGGESTED');
							results.push({ id: tripId, success: false, error: 'Failed to reject trip' });
							continue;
						}

						logInfo(`Trip rejected successfully: ${updatedTrip.id}`, 'TRIPS-SUGGESTED');
						results.push({ id: tripId, success: true, tripId: updatedTrip.id });
					}
				}

				logSuccess(`${action} action completed`, 'TRIPS-SUGGESTED', {
					userId: user.id,
					action,
					results: results.map((r) => ({ id: r.id, success: r.success }))
				});

				return successResponse({ results });
			}

			return errorResponse('Invalid action', 400);
		}

		if (req.method === 'DELETE') {
			logInfo('Clearing all suggested trips', 'TRIPS-SUGGESTED', { userId: user.id });

			// Delete all pending and rejected trips for the user
			const { error: deleteError } = await supabase
				.from('trips')
				.delete()
				.eq('user_id', user.id)
				.in('status', ['pending', 'rejected']);

			if (deleteError) {
				logError(deleteError, 'TRIPS-SUGGESTED');
				return errorResponse('Failed to clear suggested trips', 500);
			}

			logSuccess(
				'All suggested trips and rejected suggestions cleared successfully',
				'TRIPS-SUGGESTED',
				{
					userId: user.id
				}
			);

			return successResponse({
				message: 'All suggested trips and rejected suggestions cleared successfully'
			});
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'TRIPS-SUGGESTED');
		return errorResponse('Internal server error', 500);
	}
});
