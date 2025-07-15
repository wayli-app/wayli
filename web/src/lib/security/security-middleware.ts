import { z } from 'zod';
import { errorResponse } from '$lib/utils/api/response';
import type { RequestEvent } from '@sveltejs/kit';

// Security configuration
export interface SecurityConfig {
  enableCSP: boolean;
  enableHSTS: boolean;
  enableXSSProtection: boolean;
  enableContentTypeSniffing: boolean;
  enableFrameOptions: boolean;
  enableReferrerPolicy: boolean;
  maxRequestSize: number;
  allowedOrigins: string[];
  rateLimitEnabled: boolean;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enableCSP: true,
  enableHSTS: true,
  enableXSSProtection: true,
  enableContentTypeSniffing: false,
  enableFrameOptions: true,
  enableReferrerPolicy: true,
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  allowedOrigins: ['http://localhost:5173', 'https://yourdomain.com'],
  rateLimitEnabled: true
};

// Input sanitization utilities
export class SecurityUtils {
  static sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, ''); // Remove vbscript: protocol
  }

  static sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  static validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static generateCSRFToken(): string {
    return crypto.randomUUID();
  }

  static validateCSRFToken(token: string, storedToken: string): boolean {
    return token === storedToken;
  }
}

// Security headers middleware
export function applySecurityHeaders(response: Response, config: SecurityConfig = DEFAULT_SECURITY_CONFIG): Response {
  const headers = new Headers(response.headers);

  // Content Security Policy
  if (config.enableCSP) {
    headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://api.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '));
  }

  // HTTP Strict Transport Security
  if (config.enableHSTS) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // XSS Protection
  if (config.enableXSSProtection) {
    headers.set('X-XSS-Protection', '1; mode=block');
  }

  // Content Type Sniffing Protection
  if (!config.enableContentTypeSniffing) {
    headers.set('X-Content-Type-Options', 'nosniff');
  }

  // Frame Options
  if (config.enableFrameOptions) {
    headers.set('X-Frame-Options', 'DENY');
  }

  // Referrer Policy
  if (config.enableReferrerPolicy) {
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  // Additional security headers
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Request validation middleware
export async function validateRequest<T>(
  schema: z.ZodSchema<T>,
  event: RequestEvent
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  try {
    const body = await event.request.text();
    if (!body) {
      return {
        success: false,
        response: errorResponse('Request body is required', 400)
      };
    }

    // Check content type
    const contentType = event.request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return {
        success: false,
        response: errorResponse('Content-Type must be application/json', 400)
      };
    }

    // Parse and validate body
    const parsedBody = JSON.parse(body);
    const validatedData = schema.parse(parsedBody);

    // Sanitize the validated data
    const sanitizedData = SecurityUtils.sanitizeObject(validatedData as Record<string, unknown>) as T;

    return {
      success: true,
      data: sanitizedData
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Use the existing validation middleware pattern
      const errorMessage = 'Validation failed';
      return {
        success: false,
        response: errorResponse(`Validation failed: ${errorMessage}`, 400)
      };
    }

    if (error instanceof SyntaxError) {
      return {
        success: false,
        response: errorResponse('Invalid JSON in request body', 400)
      };
    }

    return {
      success: false,
      response: errorResponse('Request validation failed', 400)
    };
  }
}

// File upload security middleware
export function validateFileUpload(
  file: File,
  config: SecurityConfig = DEFAULT_SECURITY_CONFIG
): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > config.maxRequestSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${config.maxRequestSize / 1024 / 1024}MB`
    };
  }

  // Check file type
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/json',
    'text/csv',
    'application/gpx+xml'
  ];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed`
    };
  }

  // Check file name for potential security issues
  const fileName = file.name.toLowerCase();
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];

  for (const ext of dangerousExtensions) {
    if (fileName.endsWith(ext)) {
      return {
        valid: false,
        error: `File extension ${ext} is not allowed`
      };
    }
  }

  return { valid: true };
}

// SQL injection prevention
export function sanitizeSQLInput(input: string): string {
  return input
    .replace(/['";\\]/g, '') // Remove SQL injection characters
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove SQL block comments
    .replace(/\*\//g, '')
    .trim();
}

// XSS prevention for HTML content
export function escapeHTML(input: string): string {
  if (typeof document === 'undefined') {
    // Server-side fallback
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

// Rate limiting helper
export function createRateLimitKey(request: Request): string {
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return `${ip}:${userAgent}`;
}