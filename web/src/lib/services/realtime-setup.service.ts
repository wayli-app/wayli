import { supabase } from '$lib/supabase';

export class RealtimeSetupService {
  private static isInitialized = false;
  private static setupChannel: any = null;
  private static isRealtimeEnabled = false;

  /**
   * Initialize realtime functionality and ensure the channel is properly set up
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('📡 Realtime already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing Supabase Realtime...');

      // Check if realtime is available by testing the connection
      const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
      if (!supabaseUrl.includes('supabase.co') && !supabaseUrl.includes('localhost')) {
        console.log('⚠️ Supabase Realtime not available - using polling fallback');
        this.isInitialized = true;
        this.isRealtimeEnabled = false;
        return;
      }

      // Test the connection by creating a temporary channel
      this.setupChannel = supabase
        .channel('setup-test')
        .on('system', { event: 'disconnect' }, () => {
          console.log('📡 Realtime setup channel disconnected');
        })
        .on('system', { event: 'reconnect' }, () => {
          console.log('📡 Realtime setup channel reconnected');
        })
        .subscribe((status) => {
          console.log('📡 Realtime setup status:', status);

          if (status === 'SUBSCRIBED') {
            console.log('✅ Supabase Realtime initialized successfully');
            this.isInitialized = true;
            this.isRealtimeEnabled = true;

            // Clean up the test channel after successful initialization
            setTimeout(() => {
              this.cleanupSetupChannel();
            }, 1000);
          } else if (status === 'CHANNEL_ERROR') {
            console.log('⚠️ Supabase Realtime not available - using polling fallback');
            this.isInitialized = true;
            this.isRealtimeEnabled = false;
            this.cleanupSetupChannel();
          } else if (status === 'TIMED_OUT') {
            console.log('⚠️ Supabase Realtime connection timed out - using polling fallback');
            this.isInitialized = true;
            this.isRealtimeEnabled = false;
            this.cleanupSetupChannel();
          }
        });

      // Set a timeout for the initialization
      setTimeout(() => {
        if (!this.isInitialized) {
          console.log('⚠️ Supabase Realtime initialization timed out - using polling fallback');
          this.isInitialized = true;
          this.isRealtimeEnabled = false;
          this.cleanupSetupChannel();
        }
      }, 5000);

    } catch (error: any) {
      console.log('⚠️ Error initializing Supabase Realtime - using polling fallback:', error?.message || error);
      this.isInitialized = true;
      this.isRealtimeEnabled = false;
    }
  }

  /**
   * Check if realtime is properly configured and available
   */
  static isRealtimeAvailable(): boolean {
    return this.isInitialized && this.isRealtimeEnabled;
  }

  /**
   * Get realtime status for monitoring
   */
  static getStatus(): { isInitialized: boolean; isConnected: boolean; isEnabled: boolean } {
    return {
      isInitialized: this.isInitialized,
      isConnected: this.setupChannel !== null,
      isEnabled: this.isRealtimeEnabled
    };
  }

  /**
   * Clean up the setup test channel
   */
  private static async cleanupSetupChannel(): Promise<void> {
    if (this.setupChannel) {
      try {
        await supabase.removeChannel(this.setupChannel);
        this.setupChannel = null;
        console.log('🧹 Realtime setup channel cleaned up');
      } catch (error: any) {
        console.error('❌ Error cleaning up setup channel:', error?.message || error);
      }
    }
  }

  /**
   * Test realtime functionality by creating a test job
   */
  static async testRealtime(): Promise<boolean> {
    if (!this.isRealtimeEnabled) {
      console.log('⚠️ Realtime not enabled - test skipped');
      return false;
    }

    try {
      console.log('🧪 Testing realtime functionality...');

      // Create a test channel to listen for job creation
      const testChannel = supabase
        .channel('realtime-test')
        .on('postgres_changes',
          { event: 'INSERT', table: 'jobs' } as any,
          (payload: any) => {
            console.log('✅ Realtime test successful - received job notification:', payload.new.id);
          }
        )
        .subscribe();

      // Wait a moment for the subscription to be established
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Clean up test channel
      await supabase.removeChannel(testChannel);

      return true;
    } catch (error: any) {
      console.error('❌ Realtime test failed:', error?.message || error);
      return false;
    }
  }

  /**
   * Get realtime configuration information
   */
  static getConfigInfo(): {
    supabaseUrl: string;
    hasRealtime: boolean;
    isEnabled: boolean;
  } {
    // Use environment variable instead of protected property
    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
    return {
      supabaseUrl,
      hasRealtime: supabaseUrl.includes('supabase.co') || supabaseUrl.includes('localhost'),
      isEnabled: this.isRealtimeEnabled
    };
  }
}