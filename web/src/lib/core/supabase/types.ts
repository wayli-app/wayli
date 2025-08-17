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
					user_id: string;
					type: string;
					status: string;
					data: Record<string, unknown>;
					created_at: string;
					updated_at: string;
					priority: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					type: string;
					status?: string;
					data: Record<string, unknown>;
					created_at?: string;
					updated_at?: string;
					priority?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					type?: string;
					status?: string;
					data?: Record<string, unknown>;
					created_at?: string;
					updated_at?: string;
					priority?: string;
				};
			};
			trips: {
				Row: {
					id: string;
					user_id: string;
					name: string;
					start_date: string;
					end_date: string;
					created_at: string;
					updated_at: string;
					metadata: Record<string, unknown>;
				};
				Insert: {
					id?: string;
					user_id: string;
					name: string;
					start_date: string;
					end_date: string;
					created_at?: string;
					updated_at?: string;
					metadata?: Record<string, unknown>;
				};
				Update: {
					id?: string;
					user_id?: string;
					name?: string;
					start_date?: string;
					end_date?: string;
					created_at?: string;
					updated_at?: string;
					metadata?: Record<string, unknown>;
				};
			};
			tracker_data: {
				Row: {
					id: string;
					user_id: string;
					timestamp: string;
					latitude: number;
					longitude: number;
					accuracy: number;
					created_at: string;
					metadata: Record<string, unknown>;
				};
				Insert: {
					id?: string;
					user_id: string;
					timestamp: string;
					latitude: number;
					longitude: number;
					accuracy: number;
					created_at?: string;
					metadata?: Record<string, unknown>;
				};
				Update: {
					id?: string;
					user_id?: string;
					timestamp?: string;
					latitude?: number;
					longitude?: number;
					accuracy?: number;
					created_at?: string;
					metadata?: Record<string, unknown>;
				};
			};
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
