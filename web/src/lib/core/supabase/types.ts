// Centralized Supabase types
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
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