import type {
  AdminUser,
  AdminUserUpdateRequest,
  AdminUserDeleteRequest,
  AdminStatistics,
  AdminUserListResponse
} from '$lib/types/admin.types';
import { handleApiError } from '$lib/utils/error-handler';
import { apiClient } from './api.service';

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