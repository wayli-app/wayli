import { supabase } from '$lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UserProfile,
  UserPreferences,
  UpdateProfileRequest,
  UpdatePreferencesRequest,
  TwoFactorSetupRequest,
  TwoFactorSetupResponse,
  TwoFactorVerifyRequest,
  TwoFactorVerifyResponse,
  TwoFactorDisableRequest,
  TwoFactorDisableResponse,
  UpdatePasswordRequest,
  UpdatePasswordResponse
} from '$lib/types/user.types';
import { handleApiError } from '$lib/utils/error-handler';
import { apiClient } from './api.service';

export class UserService {
  static async isUserAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
    if (!userId) {
      return false;
    }
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        console.error('Error getting user:', error?.message);
        return false;
      }

      // Check role from user_metadata
      const metadata = user.user_metadata || {};
      const role = metadata.role || 'user';
      return role === 'admin';
    } catch (e) {
      console.error('Exception when checking admin status:', e);
      return false;
    }
  }

  static async getProfile(): Promise<UserProfile> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('User not authenticated');

      // Get profile from user_metadata
      const metadata = user.user_metadata || {};
      console.log('UserService - User metadata:', metadata);
      console.log('UserService - User object:', user);

      // Return profile with defaults if no data exists
      return {
        id: user.id,
        email: user.email || '',
        first_name: metadata.first_name || '',
        last_name: metadata.last_name || '',
        full_name: metadata.full_name || '',
        role: metadata.role || 'user',
        avatar_url: metadata.avatar_url || '',
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at
      };
    } catch (error) {
      console.error('UserService.getProfile error:', error);
      // Return a default profile instead of throwing
      return {
        id: '',
        email: '',
        first_name: '',
        last_name: '',
        full_name: '',
        role: 'user',
        avatar_url: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
  }

  static async updateProfile(updates: UpdateProfileRequest): Promise<UserProfile> {
    try {
      console.log('UserService.updateProfile called with:', updates);

      console.log('Step 1: Calling server API...');
      const response = await fetch('/api/v1/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }

      const result = await response.json();
      console.log('Step 1 complete: Profile updated via API');

      console.log('Step 2: Getting updated profile...');
      const profile = await this.getProfile();
      console.log('Step 2 complete: Profile retrieved');

      return profile;
    } catch (error) {
      console.error('UserService.updateProfile error:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw handleApiError(error, 'Failed to update profile');
    }
  }

  static async getPreferences(): Promise<UserPreferences> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('User not authenticated');

      // Get preferences from user_metadata
      const metadata = user.user_metadata || {};
      console.log('UserService - Preferences user metadata:', metadata);

      return {
        id: user.id,
        theme: metadata.theme || 'light',
        language: metadata.language || 'en',
        notifications_enabled: metadata.notifications_enabled ?? true,
        timezone: metadata.timezone || 'UTC+00:00 (London, Dublin)',
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at
      };
    } catch (error) {
      console.error('UserService.getPreferences error:', error);
      // Return default preferences instead of throwing
      return {
        id: '',
        theme: 'light',
        language: 'en',
        notifications_enabled: true,
        timezone: 'UTC+00:00 (London, Dublin)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
  }

  static async updatePreferences(updates: UpdatePreferencesRequest): Promise<UserPreferences> {
    try {
      console.log('UserService.updatePreferences called with:', updates);

      console.log('Step 1: Calling server API...');
      const response = await fetch('/api/v1/auth/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update preferences');
      }

      const result = await response.json();
      console.log('Step 1 complete: Preferences updated via API');

      console.log('Step 2: Getting updated preferences...');
      const preferences = await this.getPreferences();
      console.log('Step 2 complete: Preferences retrieved');

      return preferences;
    } catch (error) {
      console.error('UserService.updatePreferences error:', error);
      throw handleApiError(error, 'Failed to update preferences');
    }
  }

  static async setupTwoFactor(data: TwoFactorSetupRequest): Promise<TwoFactorSetupResponse> {
    try {
      return await apiClient.post<TwoFactorSetupResponse>('/auth/2fa/setup', data);
    } catch (error) {
      throw handleApiError(error, 'Failed to setup 2FA');
    }
  }

  static async verifyTwoFactor(data: TwoFactorVerifyRequest): Promise<TwoFactorVerifyResponse> {
    try {
      return await apiClient.post<TwoFactorVerifyResponse>('/auth/2fa/verify', data);
    } catch (error) {
      throw handleApiError(error, 'Failed to verify 2FA');
    }
  }

  static async disableTwoFactor(data: TwoFactorDisableRequest): Promise<TwoFactorDisableResponse> {
    try {
      return await apiClient.post<TwoFactorDisableResponse>('/auth/2fa/disable', data);
    } catch (error) {
      throw handleApiError(error, 'Failed to disable 2FA');
    }
  }

  static async updatePassword(data: UpdatePasswordRequest): Promise<UpdatePasswordResponse> {
    try {
      return await apiClient.post<UpdatePasswordResponse>('/auth/password', data);
    } catch (error) {
      throw handleApiError(error, 'Failed to update password');
    }
  }
}