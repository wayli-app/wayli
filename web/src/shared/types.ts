// Database types for Supabase
// This is a basic type definition - in production, this should be generated from your database schema

export interface Database {
	public: {
		Tables: {
			users: {
				Row: {
					id: string;
					email: string;
					created_at: string;
					updated_at: string;
					role: string;
					preferences: Record<string, unknown>;
				};
				Insert: {
					id?: string;
					email: string;
					created_at?: string;
					updated_at?: string;
					role?: string;
					preferences?: Record<string, unknown>;
				};
				Update: {
					id?: string;
					email?: string;
					created_at?: string;
					updated_at?: string;
					role?: string;
					preferences?: Record<string, unknown>;
				};
			};
			jobs: {
				Row: {
					id: string;
					type: string;
					status: string;
					priority: string;
					data: Record<string, unknown>;
					progress: number;
					result: Record<string, unknown> | null;
					error: string | null;
					last_error: string | null;
					retry_count: number;
					created_at: string;
					updated_at: string;
					started_at: string | null;
					completed_at: string | null;
					created_by: string;
					worker_id: string | null;
				};
				Insert: {
					id?: string;
					type: string;
					status?: string;
					priority?: string;
					data: Record<string, unknown>;
					progress?: number;
					result?: Record<string, unknown> | null;
					error?: string | null;
					last_error?: string | null;
					retry_count?: number;
					created_at?: string;
					updated_at?: string;
					started_at?: string | null;
					completed_at?: string | null;
					created_by: string;
					worker_id?: string | null;
				};
				Update: {
					id?: string;
					type?: string;
					status?: string;
					priority?: string;
					data?: Record<string, unknown>;
					progress?: number;
					result?: Record<string, unknown> | null;
					error?: string | null;
					last_error?: string | null;
					retry_count?: number;
					created_at?: string;
					updated_at?: string;
					started_at?: string | null;
					completed_at?: string | null;
					created_by?: string;
					worker_id?: string | null;
				};
			};
			trips: {
				Row: {
					id: string;
					user_id: string;
					title: string;
					description: string | null;
					start_date: string;
					end_date: string;
					status: string;
					image_url: string | null;
					labels: string[];
					metadata: Record<string, unknown> | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					title: string;
					description?: string | null;
					start_date: string;
					end_date: string;
					status?: string;
					image_url?: string | null;
					labels?: string[];
					metadata?: Record<string, unknown> | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					title?: string;
					description?: string | null;
					start_date?: string;
					end_date?: string;
					status?: string;
					image_url?: string | null;
					labels?: string[];
					metadata?: Record<string, unknown> | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			tracker_data: {
				Row: {
					user_id: string;
					tracker_type: string;
					device_id: string | null;
					recorded_at: string;
					location: unknown; // PostGIS geometry
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
					raw_data: Record<string, unknown> | null;
					geocode: Record<string, unknown> | null;
					tz_diff: number | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					user_id: string;
					tracker_type: string;
					device_id?: string | null;
					recorded_at: string;
					location?: unknown; // PostGIS geometry
					country_code?: string | null;
					altitude?: number | null;
					accuracy?: number | null;
					speed?: number | null;
					distance?: number | null;
					time_spent?: number | null;
					heading?: number | null;
					battery_level?: number | null;
					is_charging?: boolean | null;
					activity_type?: string | null;
					raw_data?: Record<string, unknown> | null;
					geocode?: Record<string, unknown> | null;
					tz_diff?: number | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					user_id?: string;
					tracker_type?: string;
					device_id?: string | null;
					recorded_at?: string;
					location?: unknown; // PostGIS geometry
					country_code?: string | null;
					altitude?: number | null;
					accuracy?: number | null;
					speed?: number | null;
					distance?: number | null;
					time_spent?: number | null;
					heading?: number | null;
					battery_level?: number | null;
					is_charging?: boolean | null;
					activity_type?: string | null;
					raw_data?: Record<string, unknown> | null;
					geocode?: Record<string, unknown> | null;
					tz_diff?: number | null;
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
					role: string;
					avatar_url: string | null;
					home_address: Record<string, unknown> | null;
					two_factor_enabled: boolean;
					two_factor_secret: string | null;
					two_factor_recovery_codes: string[] | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					first_name?: string | null;
					last_name?: string | null;
					full_name?: string | null;
					role?: string;
					avatar_url?: string | null;
					home_address?: Record<string, unknown> | null;
					two_factor_enabled?: boolean;
					two_factor_secret?: string | null;
					two_factor_recovery_codes?: string[] | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					first_name?: string | null;
					last_name?: string | null;
					full_name?: string | null;
					role?: string;
					avatar_url?: string | null;
					home_address?: Record<string, unknown> | null;
					two_factor_enabled?: boolean;
					two_factor_secret?: string | null;
					two_factor_recovery_codes?: string[] | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			user_preferences: {
				Row: {
					id: string;
					theme: string;
					language: string;
					notifications_enabled: boolean;
					timezone: string;
					pexels_api_key: string | null;
					trip_exclusions: Record<string, unknown>[];
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id: string;
					theme?: string;
					language?: string;
					notifications_enabled?: boolean;
					timezone?: string;
					pexels_api_key?: string | null;
					trip_exclusions?: Record<string, unknown>[];
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					theme?: string;
					language?: string;
					notifications_enabled?: boolean;
					timezone?: string;
					pexels_api_key?: string | null;
					trip_exclusions?: Record<string, unknown>[];
					created_at?: string;
					updated_at?: string;
				};
			};
			workers: {
				Row: {
					id: string;
					user_id: string;
					status: string;
					current_job: string | null;
					last_heartbeat: string;
					started_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					status?: string;
					current_job?: string | null;
					last_heartbeat?: string;
					started_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					status?: string;
					current_job?: string | null;
					last_heartbeat?: string;
					started_at?: string;
					updated_at?: string;
				};
			};
			poi_visit_logs: {
				Row: {
					id: string;
					user_id: string;
					visit_start: string;
					visit_end: string;
					duration_minutes: number;
					confidence_score: number | null;
					visit_type: string;
					notes: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					visit_start: string;
					visit_end: string;
					duration_minutes: number;
					confidence_score?: number | null;
					visit_type?: string;
					notes?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					visit_start?: string;
					visit_end?: string;
					duration_minutes?: number;
					confidence_score?: number | null;
					visit_type?: string;
					notes?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			audit_logs: {
				Row: {
					id: string;
					user_id: string | null;
					event_type: string;
					severity: string;
					description: string;
					ip_address: string | null;
					user_agent: string | null;
					request_id: string | null;
					metadata: Record<string, unknown>;
					timestamp: string;
					updated_at: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id?: string | null;
					event_type: string;
					severity: string;
					description: string;
					ip_address?: string | null;
					user_agent?: string | null;
					request_id?: string | null;
					metadata?: Record<string, unknown>;
					timestamp?: string;
					updated_at?: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string | null;
					event_type?: string;
					severity?: string;
					description?: string;
					ip_address?: string | null;
					user_agent?: string | null;
					request_id?: string | null;
					metadata?: Record<string, unknown>;
					timestamp?: string;
					updated_at?: string;
					created_at?: string;
				};
			};
			server_settings: {
				Row: {
					id: string;
					server_name: string;
					is_setup_complete: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					server_name?: string;
					is_setup_complete?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					server_name?: string;
					is_setup_complete?: boolean;
					created_at?: string;
					updated_at?: string;
				};
			};
			want_to_visit_places: {
				Row: {
					id: string;
					user_id: string;
					title: string;
					type: string;
					coordinates: string;
					description: string | null;
					address: string | null;
					location: string | null;
					marker_type: string;
					marker_color: string;
					labels: string[];
					favorite: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					title: string;
					type: string;
					coordinates: string;
					description?: string | null;
					address?: string | null;
					location?: string | null;
					marker_type?: string;
					marker_color?: string;
					labels?: string[];
					favorite?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					title?: string;
					type?: string;
					coordinates?: string;
					description?: string | null;
					address?: string | null;
					location?: string | null;
					marker_type?: string;
					marker_color?: string;
					labels?: string[];
					favorite?: boolean;
					created_at?: string;
					updated_at?: string;
				};
			};
		};
		Functions: {
			update_tracker_distances: {
				Args: { target_user_id?: string };
				Returns: number;
			};
			update_tracker_distances_batch: {
				Args: { target_user_id?: string; batch_size?: number };
				Returns: number;
			};
			full_country: {
				Args: { country: string };
				Returns: string;
			};
		};
	};
}
