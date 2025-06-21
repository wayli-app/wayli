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

      // Check role from raw_user_metadata
      const role = user.user_metadata?.role || 'user';
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

      // Get profile from raw_user_metadata
      const metadata = user.user_metadata || {};

      return {
        id: user.id,
        email: user.email || '',
        first_name: metadata.first_name || '',
        last_name: metadata.last_name || '',
        full_name: metadata.full_name || '',
        role: metadata.role || 'user',
        avatar_url: metadata.avatar_url,
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at
      };
    } catch (error) {
      throw handleApiError(error, 'Failed to get user profile');
    }
  }

  static async updateProfile(updates: UpdateProfileRequest): Promise<UserProfile> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('User not authenticated');

      // Update profile in raw_user_metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          ...updates
        }
      });

      if (updateError) throw updateError;
      return await this.getProfile();
    } catch (error) {
      throw handleApiError(error, 'Failed to update profile');
    }
  }

  static async getPreferences(): Promise<UserPreferences> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('User not authenticated');

      // Get preferences from database
      const { data: preferences, error: preferencesError } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('id', user.id)
        .single();

      if (preferencesError && preferencesError.code !== 'PGRST116') {
        throw preferencesError;
      }

      return {
        id: user.id,
        theme: preferences?.theme || 'light',
        language: preferences?.language || 'en',
        notifications_enabled: preferences?.notifications_enabled ?? true,
        created_at: preferences?.created_at || new Date().toISOString(),
        updated_at: preferences?.updated_at || new Date().toISOString()
      };
    } catch (error) {
      throw handleApiError(error, 'Failed to get user preferences');
    }
  }

  static async updatePreferences(updates: UpdatePreferencesRequest): Promise<UserPreferences> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('User not authenticated');

      // Update preferences in database
      const { error: updateError } = await supabase
        .from('user_preferences')
        .upsert({
          id: user.id,
          ...updates,
          updated_at: new Date().toISOString()
        });

      if (updateError) throw updateError;
      return await this.getPreferences();
    } catch (error) {
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