import { supabase } from '$lib/supabase';
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
  static async getProfile(): Promise<UserProfile> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) throw new Error('User not authenticated');

      return {
        id: user.id,
        email: user.email || '',
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        fullName: user.user_metadata?.full_name || '',
        avatarUrl: user.user_metadata?.avatar_url,
        createdAt: user.created_at,
        updatedAt: user.updated_at || user.created_at
      };
    } catch (error) {
      throw handleApiError(error, 'Failed to get user profile');
    }
  }

  static async updateProfile(updates: UpdateProfileRequest): Promise<UserProfile> {
    try {
      const { error } = await supabase.auth.updateUser({
        data: updates
      });
      if (error) throw error;
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

      return {
        preferredLanguage: user.user_metadata?.preferred_language || 'English',
        distanceUnit: user.user_metadata?.distance_unit || 'Kilometers (km)',
        temperatureUnit: user.user_metadata?.temperature_unit || 'Celsius (°C)',
        timezone: user.user_metadata?.timezone || 'UTC+00:00 (London, Dublin)'
      };
    } catch (error) {
      throw handleApiError(error, 'Failed to get user preferences');
    }
  }

  static async updatePreferences(updates: UpdatePreferencesRequest): Promise<UserPreferences> {
    try {
      // Convert camelCase keys to snake_case for Supabase storage
      const supabaseUpdates: any = {};
      if (updates.preferredLanguage !== undefined) {
        supabaseUpdates.preferred_language = updates.preferredLanguage;
      }
      if (updates.distanceUnit !== undefined) {
        supabaseUpdates.distance_unit = updates.distanceUnit;
      }
      if (updates.temperatureUnit !== undefined) {
        supabaseUpdates.temperature_unit = updates.temperatureUnit;
      }
      if (updates.timezone !== undefined) {
        supabaseUpdates.timezone = updates.timezone;
      }

      const { error } = await supabase.auth.updateUser({
        data: supabaseUpdates
      });
      if (error) throw error;
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