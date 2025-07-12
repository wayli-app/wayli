import { createClient } from '@supabase/supabase-js';
import type { UserProfile } from '$lib/types/user.types';

export class UserProfileService {
  private static supabase = createClient(
    'http://127.0.0.1:54321',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );

  /**
   * Get user profile by ID
   */
  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.supabase.auth.admin.getUserById(userId);

      if (error || !data.user) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      const user = data.user;
      const metadata = user.user_metadata || {};

      return {
        id: user.id,
        email: user.email ?? '',
        first_name: metadata.first_name || '',
        last_name: metadata.last_name || '',
        full_name: metadata.full_name || `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim() || '',
        role: (metadata.role as 'user' | 'admin' | 'moderator') || 'user',
        avatar_url: metadata.avatar_url || user.user_metadata?.avatar_url,
        home_address: metadata.home_address,
        email_confirmed_at: user.email_confirmed_at,
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at
      };
    } catch (error) {
      console.error('Error in getUserProfile:', error);
      return null;
    }
  }

  /**
   * Check if a user is an admin
   */
  static async isUserAdmin(userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .rpc('is_user_admin', { user_uuid: userId });

      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }

      return data || false;
    } catch (error) {
      console.error('Error in isUserAdmin:', error);
      return false;
    }
  }

    /**
   * Update user role (admin only)
   */
  static async updateUserRole(userId: string, newRole: 'user' | 'admin' | 'moderator'): Promise<boolean> {
    try {
      // Get current user data
      const { data: currentUser, error: fetchError } = await this.supabase.auth.admin.getUserById(userId);

      if (fetchError || !currentUser.user) {
        console.error('Error fetching user for role update:', fetchError);
        return false;
      }

      // Update user metadata with new role
      const updatedMetadata = {
        ...currentUser.user.user_metadata,
        role: newRole
      };

      const { error: updateError } = await this.supabase.auth.admin.updateUserById(userId, {
        user_metadata: updatedMetadata
      });

      if (updateError) {
        console.error('Error updating user role:', updateError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in updateUserRole:', error);
      return false;
    }
  }

  /**
   * Get all users (admin only)
   */
  static async getAllUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await this.supabase.auth.admin.listUsers();

      if (error) {
        console.error('Error fetching all users:', error);
        return [];
      }

      return (data.users || []).map(user => {
        const metadata = user.user_metadata || {};
        return {
          id: user.id,
          email: user.email,
          first_name: metadata.first_name || '',
          last_name: metadata.last_name || '',
          full_name: metadata.full_name || `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim() || '',
          role: (metadata.role as 'user' | 'admin' | 'moderator') || 'user',
          avatar_url: metadata.avatar_url || user.user_metadata?.avatar_url,
          home_address: metadata.home_address,
          email_confirmed_at: user.email_confirmed_at,
          created_at: user.created_at,
          updated_at: user.updated_at || user.created_at
        };
      });
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      return [];
    }
  }

  /**
   * Count total users
   */
  static async getUserCount(): Promise<number> {
    try {
      const { data, error } = await this.supabase.auth.admin.listUsers();

      if (error) {
        console.error('Error counting users:', error);
        return 0;
      }

      return data.users?.length || 0;
    } catch (error) {
      console.error('Error in getUserCount:', error);
      return 0;
    }
  }

  /**
   * Check if this is the first user in the system
   */
  static async isFirstUser(): Promise<boolean> {
    const count = await this.getUserCount();
    return count === 0;
  }

}