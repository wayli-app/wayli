import { corsHeaders, handleCors } from './cors.ts';
import { createAuthenticatedClient } from './supabase.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthenticatedContext {
  user: Record<string, unknown>;
  supabase: SupabaseClient;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Authenticate the request and return user context
 */
export async function authenticateRequest(req: Request): Promise<AuthenticatedContext> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('No authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createAuthenticatedClient(token);

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Invalid token');
  }

  return { user, supabase };
}

/**
 * Create a success response
 */
export function successResponse<T>(data: T, status = 200): Response {
  const response: ApiResponse<T> = {
    success: true,
    data
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Create an error response
 */
export function errorResponse(message: string, status = 400): Response {
  const response: ApiResponse = {
    success: false,
    error: message
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Create a message response
 */
export function messageResponse(message: string, status = 200): Response {
  const response: ApiResponse = {
    success: true,
    message
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Handle CORS and common request setup
 */
export function setupRequest(req: Request): Response | null {
  return handleCors(req);
}

/**
 * Parse JSON body with error handling
 */
export async function parseJsonBody<T>(req: Request): Promise<T> {
  try {
    return await req.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
}

/**
 * Get query parameters from URL
 */
export function getQueryParams(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

/**
 * Extract path parameters from URL
 */
export function getPathParams(url: string, pattern: string): Record<string, string> {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith('[') && patternParts[i].endsWith(']')) {
      const paramName = patternParts[i].slice(1, -1);
      params[paramName] = pathParts[i] || '';
    }
  }

  return params;
}

/**
 * Validate required fields in an object
 */
export function validateRequiredFields(obj: Record<string, unknown>, fields: string[]): string[] {
  const missing: string[] = [];

  for (const field of fields) {
    if (!obj || obj[field] === undefined || obj[field] === null || obj[field] === '') {
      missing.push(field);
    }
  }

  return missing;
}

/**
 * Log error with context
 */
export function logError(error: unknown, context: string): void {
  console.error(`❌ [${context}] Error:`, error);
}

/**
 * Log info with context
 */
export function logInfo(message: string, context: string, data?: unknown): void {
  console.log(`ℹ️ [${context}] ${message}`, data || '');
}

/**
 * Log success with context
 */
export function logSuccess(message: string, context: string, data?: unknown): void {
  console.log(`✅ [${context}] ${message}`, data || '');
}