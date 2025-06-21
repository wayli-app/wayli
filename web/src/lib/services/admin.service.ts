import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminUser,
  AdminUserUpdateRequest,
  AdminUserDeleteRequest,
  AdminStatistics,
  AdminUserListResponse
} from '$lib/types/admin.types';
import { handleApiError } from '$lib/utils/error-handler';
import { apiClient } from './api.service';

export async function isDatabaseInitialized(supabase: SupabaseClient): Promise<boolean> {
	try {
		// Check if the jobs table exists as an indicator that the database is initialized
		const { error } = await supabase.from('jobs').select('id').limit(1);
		// If we get an error where the relation does not exist, the db is not initialized.
		if (error && error.code === '42P01') {
			return false;
		}
		return true;
	} catch (e) {
		return false;
	}
}

export async function isFirstUserCreated(supabase: SupabaseClient): Promise<boolean> {
	try {
		const { data, error } = await supabase.rpc('get_user_count');
		if (error) {
			console.error('Error checking for first user:', error);
			// If the function doesn't exist, maybe the DB is not fully initialized.
			// Or if another error occurs, we assume a user might exist to be safe.
			return true;
		}
		return data > 0;
	} catch (e) {
		return true; // Fail safe
	}
}

export class AdminService {
  static async getUsers(page: number = 1, limit: number = 10, search?: string): Promise<AdminUserListResponse> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search })
      });
      return await apiClient.get<AdminUserListResponse>(`/admin/users?${params}`);
    } catch (error) {
      throw handleApiError(error, 'Failed to get users');
    }
  }

  static async updateUser(data: AdminUserUpdateRequest): Promise<{ success: boolean; message?: string }> {
    try {
      return await apiClient.put<{ success: boolean; message?: string }>('/admin/users', data);
    } catch (error) {
      throw handleApiError(error, 'Failed to update user');
    }
  }

  static async deleteUser(data: AdminUserDeleteRequest): Promise<{ success: boolean; message?: string }> {
    try {
      return await apiClient.delete<{ success: boolean; message?: string }>(`/admin/users/${data.userId}`);
    } catch (error) {
      throw handleApiError(error, 'Failed to delete user');
    }
  }

  static async getStatistics(): Promise<AdminStatistics> {
    try {
      return await apiClient.get<AdminStatistics>('/admin/statistics');
    } catch (error) {
      throw handleApiError(error, 'Failed to get statistics');
    }
  }
}