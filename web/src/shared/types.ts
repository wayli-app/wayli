// Auto-generated database types for the Wayli `public` schema.
// Source of truth: fluxbase/schema/public.sql (declarative schema).
// Regenerate from the live schema; do not edit by hand.
//
// NOTE: This Database interface mirrors the Supabase/Fluxbase SDK shape.
// App code currently imports domain types from src/lib/types/*.types.ts;
// this file documents the deployed table structure for type-safe queries.

export interface Database {
	public: {
		Tables: {
			fitness_activities: {
				Row: {
					id: string;
					user_id: string;
					sport: string | null;
					sub_sport: string | null;
					started_at: string;
					ended_at: string | null;
					total_distance_m: number | null;
					elapsed_time_s: number | null;
					moving_time_s: number | null;
					avg_heartrate: number | null;
					max_heartrate: number | null;
					avg_power: number | null;
					max_power: number | null;
					avg_cadence: number | null;
					calories: number | null;
					manufacturer: string | null;
					product: string | null;
					serial_number: string | null;
					source_file: string | null;
					created_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					sport?: string;
					sub_sport?: string;
					started_at: string;
					ended_at?: string;
					total_distance_m?: number;
					elapsed_time_s?: number;
					moving_time_s?: number;
					avg_heartrate?: number;
					max_heartrate?: number;
					avg_power?: number;
					max_power?: number;
					avg_cadence?: number;
					calories?: number;
					manufacturer?: string;
					product?: string;
					serial_number?: string;
					source_file?: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					sport?: string;
					sub_sport?: string;
					started_at?: string;
					ended_at?: string;
					total_distance_m?: number;
					elapsed_time_s?: number;
					moving_time_s?: number;
					avg_heartrate?: number;
					max_heartrate?: number;
					avg_power?: number;
					max_power?: number;
					avg_cadence?: number;
					calories?: number;
					manufacturer?: string;
					product?: string;
					serial_number?: string;
					source_file?: string;
					created_at?: string;
				};
			};
			fitness_records: {
				Row: {
					activity_id: string;
					user_id: string;
					recorded_at: string;
					heart_rate: number | null;
					cadence: number | null;
					power: number | null;
					temperature: number | null;
					cumulative_distance_m: number | null;
					created_at: string | null;
				};
				Insert: {
					activity_id: string;
					user_id: string;
					recorded_at: string;
					heart_rate?: number;
					cadence?: number;
					power?: number;
					temperature?: number;
					cumulative_distance_m?: number;
					created_at?: string;
				};
				Update: {
					activity_id?: string;
					user_id?: string;
					recorded_at?: string;
					heart_rate?: number;
					cadence?: number;
					power?: number;
					temperature?: number;
					cumulative_distance_m?: number;
					created_at?: string;
				};
			};
			country_name_aliases: {
				Row: {
					name: string;
					iso2: string;
				};
				Insert: {
					name: string;
					iso2: string;
				};
				Update: {
					name?: string;
					iso2?: string;
				};
			};
			place_visits: {
				Row: {
					id: string;
					user_id: string;
					started_at: string;
					duration_minutes: number | null;
					location: string | null;
					poi_name: string | null;
					poi_layer: string | null;
					poi_amenity: string | null;
					poi_cuisine: string | null;
					poi_sport: string | null;
					poi_category: string | null;
					confidence_score: number | null;
					avg_distance_meters: number | null;
					poi_tags: Record<string, unknown> | null;
					city: string | null;
					country_code: string | null;
					gps_points_count: number | null;
					visit_hour: number | null;
					visit_time_of_day: string | null;
					day_of_week: string | null;
					is_weekend: boolean | null;
					duration_category: string | null;
					poi_name_search: unknown | null;
					alt_poi_name: string | null;
					alt_poi_amenity: string | null;
					alt_poi_cuisine: string | null;
					alt_poi_sport: string | null;
					alt_poi_distance: number | null;
					alt_poi_tags: Record<string, unknown> | null;
					alt_poi_confidence: number | null;
					created_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					started_at: string;
					duration_minutes?: number;
					location?: string;
					poi_name?: string;
					poi_layer?: string;
					poi_amenity?: string;
					poi_cuisine?: string;
					poi_sport?: string;
					poi_category?: string;
					confidence_score?: number;
					avg_distance_meters?: number;
					poi_tags?: Record<string, unknown>;
					city?: string;
					country_code?: string;
					gps_points_count?: number;
					visit_hour?: number;
					visit_time_of_day?: string;
					day_of_week?: string;
					is_weekend?: boolean;
					duration_category?: string;
					poi_name_search?: unknown;
					alt_poi_name?: string;
					alt_poi_amenity?: string;
					alt_poi_cuisine?: string;
					alt_poi_sport?: string;
					alt_poi_distance?: number;
					alt_poi_tags?: Record<string, unknown>;
					alt_poi_confidence?: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					started_at?: string;
					duration_minutes?: number;
					location?: string;
					poi_name?: string;
					poi_layer?: string;
					poi_amenity?: string;
					poi_cuisine?: string;
					poi_sport?: string;
					poi_category?: string;
					confidence_score?: number;
					avg_distance_meters?: number;
					poi_tags?: Record<string, unknown>;
					city?: string;
					country_code?: string;
					gps_points_count?: number;
					visit_hour?: number;
					visit_time_of_day?: string;
					day_of_week?: string;
					is_weekend?: boolean;
					duration_category?: string;
					poi_name_search?: unknown;
					alt_poi_name?: string;
					alt_poi_amenity?: string;
					alt_poi_cuisine?: string;
					alt_poi_sport?: string;
					alt_poi_distance?: number;
					alt_poi_tags?: Record<string, unknown>;
					alt_poi_confidence?: number;
					created_at?: string;
					updated_at?: string;
				};
			};
			place_visits_state: {
				Row: {
					id: number;
					user_id: string | null;
					last_processed_at: string | null;
					last_full_refresh_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id: number;
					user_id?: string;
					last_processed_at?: string;
					last_full_refresh_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: number;
					user_id?: string;
					last_processed_at?: string;
					last_full_refresh_at?: string;
					updated_at?: string;
				};
			};
			poi_embeddings: {
				Row: {
					id: string;
					user_id: string;
					poi_name: string;
					poi_amenity: string | null;
					poi_category: string | null;
					city: string | null;
					country_code: string | null;
					embedding: number[] | null;
					source_text: string | null;
					poi_cuisine: string | null;
					poi_sport: string | null;
					visit_count: number | null;
					avg_duration_minutes: number | null;
					embedded_at: string | null;
					created_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					poi_name: string;
					poi_amenity?: string;
					poi_category?: string;
					city?: string;
					country_code?: string;
					embedding?: number[];
					source_text?: string;
					poi_cuisine?: string;
					poi_sport?: string;
					visit_count?: number;
					avg_duration_minutes?: number;
					embedded_at?: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					poi_name?: string;
					poi_amenity?: string;
					poi_category?: string;
					city?: string;
					country_code?: string;
					embedding?: number[];
					source_text?: string;
					poi_cuisine?: string;
					poi_sport?: string;
					visit_count?: number;
					avg_duration_minutes?: number;
					embedded_at?: string;
					created_at?: string;
					updated_at?: string;
				};
			};
			tracker_daily_activity: {
				Row: {
					user_id: string;
					day: string;
					distance: number | null;
					time_spent: number | null;
					points: number | null;
					updated_at: string | null;
				};
				Insert: {
					user_id: string;
					day: string;
					distance?: number;
					time_spent?: number;
					points?: number;
					updated_at?: string;
				};
				Update: {
					user_id?: string;
					day?: string;
					distance?: number;
					time_spent?: number;
					points?: number;
					updated_at?: string;
				};
			};
			tracker_daily_activity_state: {
				Row: {
					id: number;
					user_id: string | null;
					last_processed_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id: number;
					user_id?: string;
					last_processed_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: number;
					user_id?: string;
					last_processed_at?: string;
					updated_at?: string;
				};
			};
			tracker_data: {
				Row: {
					user_id: string;
					tracker_type: string;
					device_id: string | null;
					recorded_at: string;
					location: string | null;
					country_code: string | null;
					altitude: number | null;
					accuracy: number | null;
					speed: number | null;
					distance: number | null;
					time_spent: number | null;
					heading: number | null;
					battery_level: number | null;
					is_charging: boolean | null;
					activity_type: string | null;
					geocode: Record<string, unknown> | null;
					tz_diff: number | null;
					created_at: string | null;
					updated_at: string | null;
					transport_mode: string | null;
					detection_reason: string | null;
					transport_mode_confidence: number | null;
					transport_mode_manual: boolean;
				};
				Insert: {
					user_id: string;
					tracker_type: string;
					device_id?: string;
					recorded_at: string;
					location?: string;
					country_code?: string;
					altitude?: number;
					accuracy?: number;
					speed?: number;
					distance?: number;
					time_spent?: number;
					heading?: number;
					battery_level?: number;
					is_charging?: boolean;
					activity_type?: string;
					geocode?: Record<string, unknown>;
					tz_diff?: number;
					created_at?: string;
					updated_at?: string;
					transport_mode?: string;
					detection_reason?: string;
					transport_mode_confidence?: number;
					transport_mode_manual?: boolean;
				};
				Update: {
					user_id?: string;
					tracker_type?: string;
					device_id?: string;
					recorded_at?: string;
					location?: string;
					country_code?: string;
					altitude?: number;
					accuracy?: number;
					speed?: number;
					distance?: number;
					time_spent?: number;
					heading?: number;
					battery_level?: number;
					is_charging?: boolean;
					activity_type?: string;
					geocode?: Record<string, unknown>;
					tz_diff?: number;
					created_at?: string;
					updated_at?: string;
					transport_mode?: string;
					detection_reason?: string;
					transport_mode_confidence?: number;
					transport_mode_manual?: boolean;
				};
			};
			transport_mode_state: {
				Row: {
					id: number;
					user_id: string | null;
					last_processed_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id: number;
					user_id?: string;
					last_processed_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: number;
					user_id?: string;
					last_processed_at?: string;
					updated_at?: string;
				};
			};
			trip_collaborators: {
				Row: {
					id: string;
					trip_id: string;
					user_id: string;
					role: string | null;
					created_at: string | null;
				};
				Insert: {
					id?: string;
					trip_id: string;
					user_id: string;
					role?: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					trip_id?: string;
					user_id?: string;
					role?: string;
					created_at?: string;
				};
			};
			trip_comments: {
				Row: {
					id: string;
					trip_id: string;
					entry_id: string | null;
					user_id: string;
					body: string;
					created_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id?: string;
					trip_id: string;
					entry_id?: string;
					user_id: string;
					body: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					trip_id?: string;
					entry_id?: string;
					user_id?: string;
					body?: string;
					created_at?: string;
					updated_at?: string;
				};
			};
			trip_embeddings: {
				Row: {
					id: string;
					user_id: string;
					trip_id: string;
					embedding: number[] | null;
					source_text: string | null;
					embedded_at: string | null;
					created_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					trip_id: string;
					embedding?: number[];
					source_text?: string;
					embedded_at?: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					trip_id?: string;
					embedding?: number[];
					source_text?: string;
					embedded_at?: string;
					created_at?: string;
					updated_at?: string;
				};
			};
			trip_entries: {
				Row: {
					id: string;
					trip_id: string;
					user_id: string;
					title: string;
					body: string;
					entry_date: string;
					created_at: string | null;
					updated_at: string | null;
					highlight_start: string | null;
					highlight_end: string | null;
					end_date: string | null;
					cover_media_id: string | null;
					cover_focal_x: number | null;
					cover_focal_y: number | null;
					status: string | null;
				};
				Insert: {
					id?: string;
					trip_id: string;
					user_id: string;
					title?: string;
					body?: string;
					entry_date: string;
					created_at?: string;
					updated_at?: string;
					highlight_start?: string;
					highlight_end?: string;
					end_date?: string;
					cover_media_id?: string;
					cover_focal_x?: number;
					cover_focal_y?: number;
					status?: string;
				};
				Update: {
					id?: string;
					trip_id?: string;
					user_id?: string;
					title?: string;
					body?: string;
					entry_date?: string;
					created_at?: string;
					updated_at?: string;
					highlight_start?: string;
					highlight_end?: string;
					end_date?: string;
					cover_media_id?: string;
					cover_focal_x?: number;
					cover_focal_y?: number;
					status?: string;
				};
			};
			trip_gps_tracks: {
				Row: {
					id: string;
					trip_id: string;
					user_id: string;
					points: Record<string, unknown>;
					created_at: string | null;
				};
				Insert: {
					id?: string;
					trip_id: string;
					user_id: string;
					points: Record<string, unknown>;
					created_at?: string;
				};
				Update: {
					id?: string;
					trip_id?: string;
					user_id?: string;
					points?: Record<string, unknown>;
					created_at?: string;
				};
			};
			trip_likes: {
				Row: {
					id: string;
					trip_id: string;
					user_id: string;
					created_at: string | null;
					entry_id: string | null;
				};
				Insert: {
					id?: string;
					trip_id: string;
					user_id: string;
					created_at?: string;
					entry_id?: string;
				};
				Update: {
					id?: string;
					trip_id?: string;
					user_id?: string;
					created_at?: string;
					entry_id?: string;
				};
			};
			trip_media: {
				Row: {
					id: string;
					trip_id: string;
					entry_id: string | null;
					user_id: string;
					storage_path: string;
					thumbnail_path: string | null;
					media_type: string;
					caption: string | null;
					sort_order: number | null;
					width: number | null;
					height: number | null;
					taken_at: string | null;
					exif: Record<string, unknown> | null;
					created_at: string | null;
				};
				Insert: {
					id?: string;
					trip_id: string;
					entry_id?: string;
					user_id: string;
					storage_path: string;
					thumbnail_path?: string;
					media_type?: string;
					caption?: string;
					sort_order?: number;
					width?: number;
					height?: number;
					taken_at?: string;
					exif?: Record<string, unknown>;
					created_at?: string;
				};
				Update: {
					id?: string;
					trip_id?: string;
					entry_id?: string;
					user_id?: string;
					storage_path?: string;
					thumbnail_path?: string;
					media_type?: string;
					caption?: string;
					sort_order?: number;
					width?: number;
					height?: number;
					taken_at?: string;
					exif?: Record<string, unknown>;
					created_at?: string;
				};
			};
			trip_plan_items: {
				Row: {
					id: string;
					trip_id: string;
					user_id: string;
					day_number: number;
					sort_order: number;
					title: string;
					description: string | null;
					type: string;
					start_time: string | null;
					end_time: string | null;
					address: string | null;
					cost_estimate: number | null;
					currency: string | null;
					booking_url: string | null;
					booking_status: string | null;
					want_to_visit_id: string | null;
					notes: string | null;
					created_by: string | null;
					created_at: string | null;
					updated_at: string | null;
					location_lat: number | null;
					location_lng: number | null;
					metadata: Record<string, unknown> | null;
				};
				Insert: {
					id?: string;
					trip_id: string;
					user_id: string;
					day_number?: number;
					sort_order?: number;
					title: string;
					description?: string;
					type?: string;
					start_time?: string;
					end_time?: string;
					address?: string;
					cost_estimate?: number;
					currency?: string;
					booking_url?: string;
					booking_status?: string;
					want_to_visit_id?: string;
					notes?: string;
					created_by?: string;
					created_at?: string;
					updated_at?: string;
					location_lat?: number;
					location_lng?: number;
					metadata?: Record<string, unknown>;
				};
				Update: {
					id?: string;
					trip_id?: string;
					user_id?: string;
					day_number?: number;
					sort_order?: number;
					title?: string;
					description?: string;
					type?: string;
					start_time?: string;
					end_time?: string;
					address?: string;
					cost_estimate?: number;
					currency?: string;
					booking_url?: string;
					booking_status?: string;
					want_to_visit_id?: string;
					notes?: string;
					created_by?: string;
					created_at?: string;
					updated_at?: string;
					location_lat?: number;
					location_lng?: number;
					metadata?: Record<string, unknown>;
				};
			};
			trip_shares: {
				Row: {
					id: string;
					trip_id: string;
					shared_with_user_id: string;
					role: string | null;
					created_at: string | null;
				};
				Insert: {
					id?: string;
					trip_id: string;
					shared_with_user_id: string;
					role?: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					trip_id?: string;
					shared_with_user_id?: string;
					role?: string;
					created_at?: string;
				};
			};
			trips: {
				Row: {
					id: string;
					user_id: string | null;
					title: string;
					description: string | null;
					start_date: string;
					end_date: string;
					status: string;
					image_url: string | null;
					labels: string[] | null;
					metadata: Record<string, unknown> | null;
					created_at: string | null;
					updated_at: string | null;
					visibility: string | null;
					budget_total: number | null;
					budget_currency: string | null;
					costs_visible_to: string | null;
					gps_visible_to: string | null;
					comments_allowed: string | null;
					plan_visible_to: string | null;
				};
				Insert: {
					id?: string;
					user_id?: string;
					title: string;
					description?: string;
					start_date: string;
					end_date: string;
					status?: string;
					image_url?: string;
					labels?: string[];
					metadata?: Record<string, unknown>;
					created_at?: string;
					updated_at?: string;
					visibility?: string;
					budget_total?: number;
					budget_currency?: string;
					costs_visible_to?: string;
					gps_visible_to?: string;
					comments_allowed?: string;
					plan_visible_to?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					title?: string;
					description?: string;
					start_date?: string;
					end_date?: string;
					status?: string;
					image_url?: string;
					labels?: string[];
					metadata?: Record<string, unknown>;
					created_at?: string;
					updated_at?: string;
					visibility?: string;
					budget_total?: number;
					budget_currency?: string;
					costs_visible_to?: string;
					gps_visible_to?: string;
					comments_allowed?: string;
					plan_visible_to?: string;
				};
			};
			user_connections: {
				Row: {
					id: string;
					user_id: string;
					friend_id: string;
					status: string | null;
					created_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					friend_id: string;
					status?: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					friend_id?: string;
					status?: string;
					created_at?: string;
				};
			};
			user_data_sampling: {
				Row: {
					user_id: string;
					enabled: boolean;
					min_distance_m: number;
					min_time_s: number;
					last_run_at: string | null;
					last_deleted: number | null;
					updated_at: string | null;
				};
				Insert: {
					user_id: string;
					enabled?: boolean;
					min_distance_m?: number;
					min_time_s?: number;
					last_run_at?: string;
					last_deleted?: number;
					updated_at?: string;
				};
				Update: {
					user_id?: string;
					enabled?: boolean;
					min_distance_m?: number;
					min_time_s?: number;
					last_run_at?: string;
					last_deleted?: number;
					updated_at?: string;
				};
			};
			user_preference_vectors: {
				Row: {
					id: string;
					user_id: string;
					preference_type: string;
					preference_embedding: number[] | null;
					top_items: Record<string, unknown> | null;
					confidence_score: number | null;
					sample_count: number | null;
					computed_at: string | null;
					created_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					preference_type: string;
					preference_embedding?: number[];
					top_items?: Record<string, unknown>;
					confidence_score?: number;
					sample_count?: number;
					computed_at?: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					preference_type?: string;
					preference_embedding?: number[];
					top_items?: Record<string, unknown>;
					confidence_score?: number;
					sample_count?: number;
					computed_at?: string;
					created_at?: string;
					updated_at?: string;
				};
			};
			user_preferences: {
				Row: {
					id: string;
					theme: string | null;
					language: string | null;
					notifications_enabled: boolean | null;
					timezone: string | null;
					trip_exclusions: Record<string, unknown> | null;
					preferences: Record<string, unknown> | null;
					created_at: string | null;
					updated_at: string | null;
				};
				Insert: {
					id: string;
					theme?: string;
					language?: string;
					notifications_enabled?: boolean;
					timezone?: string;
					trip_exclusions?: Record<string, unknown>;
					preferences?: Record<string, unknown>;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					theme?: string;
					language?: string;
					notifications_enabled?: boolean;
					timezone?: string;
					trip_exclusions?: Record<string, unknown>;
					preferences?: Record<string, unknown>;
					created_at?: string;
					updated_at?: string;
				};
			};
			user_profiles: {
				Row: {
					id: string;
					first_name: string | null;
					last_name: string | null;
					full_name: string | null;
					role: string | null;
					avatar_url: string | null;
					home_address: Record<string, unknown> | null;
					onboarding_completed: boolean | null;
					onboarding_dismissed: boolean | null;
					home_address_skipped: boolean | null;
					first_login_at: string | null;
					created_at: string | null;
					updated_at: string | null;
					username: string | null;
					cover_photo_url: string | null;
					cover_focal_x: number | null;
					cover_focal_y: number | null;
					discoverable: string | null;
				};
				Insert: {
					id: string;
					first_name?: string;
					last_name?: string;
					full_name?: string;
					role?: string;
					avatar_url?: string;
					home_address?: Record<string, unknown>;
					onboarding_completed?: boolean;
					onboarding_dismissed?: boolean;
					home_address_skipped?: boolean;
					first_login_at?: string;
					created_at?: string;
					updated_at?: string;
					username?: string;
					cover_photo_url?: string;
					cover_focal_x?: number;
					cover_focal_y?: number;
					discoverable?: string;
				};
				Update: {
					id?: string;
					first_name?: string;
					last_name?: string;
					full_name?: string;
					role?: string;
					avatar_url?: string;
					home_address?: Record<string, unknown>;
					onboarding_completed?: boolean;
					onboarding_dismissed?: boolean;
					home_address_skipped?: boolean;
					first_login_at?: string;
					created_at?: string;
					updated_at?: string;
					username?: string;
					cover_photo_url?: string;
					cover_focal_x?: number;
					cover_focal_y?: number;
					discoverable?: string;
				};
			};
			want_to_visit_places: {
				Row: {
					id: string;
					user_id: string;
					place_id: string | null;
					title: string;
					country_code: string | null;
					type: string | null;
					favorite: boolean | null;
					description: string | null;
					location: string;
					address: string | null;
					marker_type: string | null;
					marker_color: string | null;
					labels: string[] | null;
					created_at: string | null;
					updated_at: string | null;
					rating: number | null;
					image_url: string | null;
					image_attribution: Record<string, unknown> | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					place_id?: string;
					title: string;
					country_code?: string;
					type?: string;
					favorite?: boolean;
					description?: string;
					location: string;
					address?: string;
					marker_type?: string;
					marker_color?: string;
					labels?: string[];
					created_at?: string;
					updated_at?: string;
					rating?: number;
					image_url?: string;
					image_attribution?: Record<string, unknown>;
				};
				Update: {
					id?: string;
					user_id?: string;
					place_id?: string;
					title?: string;
					country_code?: string;
					type?: string;
					favorite?: boolean;
					description?: string;
					location?: string;
					address?: string;
					marker_type?: string;
					marker_color?: string;
					labels?: string[];
					created_at?: string;
					updated_at?: string;
					rating?: number;
					image_url?: string;
					image_attribution?: Record<string, unknown>;
				};
			};
		};
		Views: {
			// Views are read-only; add per-view Row types as needed.
			[key: string]: { Row: Record<string, unknown> };
		};
		Functions: {
			// RPC function signatures; add as needed (see fluxbase/schema/public.sql).
			[key: string]: unknown;
		};
	};
}
