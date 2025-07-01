import { createServerClient } from '$lib/core/supabase/server-client';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface Migration {
  version: string;
  name: string;
  filename: string;
  content: string;
  checksum: string;
}

export interface MigrationResult {
  success: boolean;
  version: string;
  name: string;
  error?: string;
}

export class DatabaseMigrationService {
  private static supabase = createServerClient();
  private static migrationsPath = path.resolve(process.cwd(), 'supabase/migrations');

  /**
   * Get all available migrations from the migrations directory
   */
  static async getAvailableMigrations(): Promise<Migration[]> {
    try {
      const files = await fs.readdir(this.migrationsPath);
      const sqlFiles = files.filter(file => file.endsWith('.sql')).sort();

      const migrations: Migration[] = [];

      for (const file of sqlFiles) {
        const filePath = path.join(this.migrationsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const checksum = crypto.createHash('md5').update(content).digest('hex');

        // Extract version and name from filename (e.g., "20241201000000_initial_schema.sql")
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (match) {
          migrations.push({
            version: match[1],
            name: match[2].replace(/_/g, ' '),
            filename: file,
            content,
            checksum
          });
        }
      }

      return migrations;
    } catch (error) {
      console.error('Error reading migrations directory:', error);
      return [];
    }
  }

  /**
   * Get applied migrations from the database
   */
  static async getAppliedMigrations(): Promise<{ version: string; applied_at: string }[]> {
    try {
      const { data, error } = await this.supabase
        .from('database_migrations')
        .select('version, applied_at')
        .order('version', { ascending: true });

      if (error) {
        console.error('Error fetching applied migrations:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching applied migrations:', error);
      return [];
    }
  }

  /**
   * Get pending migrations (available but not applied)
   */
  static async getPendingMigrations(): Promise<Migration[]> {
    const available = await this.getAvailableMigrations();
    const applied = await this.getAppliedMigrations();
    const appliedVersions = new Set(applied.map(m => m.version));

    return available.filter(migration => !appliedVersions.has(migration.version));
  }

  /**
   * Apply a single migration
   */
  static async applyMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      console.log(`Applying migration: ${migration.version} - ${migration.name}`);

      // Execute the migration SQL
      const { error } = await this.supabase.rpc('exec_sql', {
        sql: migration.content
      });

      if (error) {
        throw new Error(`Migration execution failed: ${error.message}`);
      }

      const executionTimeMs = Date.now() - startTime;

      // Record the migration as applied
      const { error: insertError } = await this.supabase
        .from('database_migrations')
        .insert({
          version: migration.version,
          name: migration.name,
          checksum: migration.checksum,
          applied_at: new Date().toISOString()
        });

      if (insertError) {
        throw new Error(`Failed to record migration: ${insertError.message}`);
      }

      console.log(`✅ Migration applied successfully: ${migration.version} - ${migration.name}`);

      return {
        success: true,
        version: migration.version,
        name: migration.name,
        error: undefined
      };

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      console.error(`❌ Migration failed: ${migration.version} - ${migration.name}`, error);

      return {
        success: false,
        version: migration.version,
        name: migration.name,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Apply all pending migrations
   */
  static async applyPendingMigrations(): Promise<MigrationResult[]> {
    const pending = await this.getPendingMigrations();
    const results: MigrationResult[] = [];

    console.log(`Found ${pending.length} pending migrations`);

    for (const migration of pending) {
      const result = await this.applyMigration(migration);
      results.push(result);

      if (!result.success) {
        console.error(`Migration failed, stopping: ${migration.version}`);
        break;
      }
    }

    return results;
  }

  /**
   * Check database health and migration status
   */
  static async checkDatabaseHealth(): Promise<{
    healthy: boolean;
    initialized: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let healthy = true;
    let initialized = false;

    try {
      // Check if wayli schema exists
      const { error: schemaError } = await this.supabase
        .from('profiles')
        .select('id')
        .limit(1);

      if (schemaError) {
        errors.push(`Database schema not found: ${schemaError.message}`);
        healthy = false;
      } else {
        initialized = true;
      }

    } catch (error) {
      errors.push(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
      healthy = false;
    }

    return {
      healthy,
      initialized,
      errors
    };
  }

  /**
   * Initialize database with basic schema
   */
  static async initializeDatabase(): Promise<boolean> {
    try {
      console.log('Initializing database...');

      // For now, we'll use the existing setup approach
      // In the future, this will use Supabase CLI migrations
      const response = await fetch('/api/v1/setup/init-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Database initialization failed: ${response.statusText}`);
      }

      console.log('✅ Database initialized successfully');
      return true;

    } catch (error) {
      console.error('Failed to initialize database:', error);
      return false;
    }
  }
}