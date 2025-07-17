// Centralized Supabase types
export interface Database {
	public: {
		Tables: {
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
					retry_count: number | null;
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
					data?: Record<string, unknown>;
					progress?: number;
					result?: Record<string, unknown> | null;
					error?: string | null;
					last_error?: string | null;
					retry_count?: number | null;
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
					retry_count?: number | null;
					created_at?: string;
					updated_at?: string;
					started_at?: string | null;
					completed_at?: string | null;
					created_by?: string;
					worker_id?: string | null;
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
			geocoded_points: {
				Row: {
					id: string;
					user_id: string;
					table_name: string;
					record_id: string;
					location: string;
					address: string | null;
					geocoding_data: Record<string, unknown> | null;
					geocoded_at: string;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					table_name: string;
					record_id: string;
					location: string;
					address?: string | null;
					geocoding_data?: Record<string, unknown> | null;
					geocoded_at?: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					table_name?: string;
					record_id?: string;
					location?: string;
					address?: string | null;
					geocoding_data?: Record<string, unknown> | null;
					geocoded_at?: string;
					created_at?: string;
					updated_at?: string;
				};
			};
			workers: {
				Row: {
					id: string;
					user_id: string | null;
					status: string;
					current_job: string | null;
					last_heartbeat: string;
					started_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id?: string | null;
					status?: string;
					current_job?: string | null;
					last_heartbeat?: string;
					started_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string | null;
					status?: string;
					current_job?: string | null;
					last_heartbeat?: string;
					started_at?: string;
					updated_at?: string;
				};
			};
			temp_files: {
				Row: {
					id: string;
					user_id: string;
					file_name: string;
					file_content: string;
					format: string;
					file_size: number;
					created_at: string;
					expires_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					file_name: string;
					file_content: string;
					format: string;
					file_size: number;
					created_at?: string;
					expires_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					file_name?: string;
					file_content?: string;
					format?: string;
					file_size?: number;
					created_at?: string;
					expires_at?: string;
				};
			};
			// Add other tables as needed...
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			[_ in never]: never;
		};
	};
}
