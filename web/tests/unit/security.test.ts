import { describe, it, expect } from 'vitest';
import { SecurityUtils } from '../../lib/security/security-middleware';
import { AuthMiddleware } from '../../lib/security/auth-middleware';

describe('Security Utils', () => {
  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      const input = '<script>alert("xss")</script>Hello World';
      const result = SecurityUtils.sanitizeString(input);
      expect(result).toBe('scriptalert("xss")/scriptHello World');
    });

    it('should remove javascript protocol', () => {
      const input = 'javascript:alert("xss")';
      const result = SecurityUtils.sanitizeString(input);
      expect(result).toBe('alert("xss")');
    });

    it('should remove data protocol', () => {
      const input = 'data:text/html,<script>alert("xss")</script>';
      const result = SecurityUtils.sanitizeString(input);
      expect(result).toBe('text/html,scriptalert("xss")/script');
    });

    it('should trim whitespace', () => {
      const input = '  Hello World  ';
      const result = SecurityUtils.sanitizeString(input);
      expect(result).toBe('Hello World');
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      validEmails.forEach(email => {
        expect(SecurityUtils.validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        'user..name@example.com'
      ];

      invalidEmails.forEach(email => {
        expect(SecurityUtils.validateEmail(email)).toBe(false);
      });
    });

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(SecurityUtils.validateEmail(longEmail)).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const strongPassword = 'StrongP@ss123';
      const result = SecurityUtils.validatePassword(strongPassword);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'short', // too short
        'nouppercase123!', // no uppercase
        'NOLOWERCASE123!', // no lowercase
        'NoNumbers!', // no numbers
        'NoSpecialChars123' // no special characters
      ];

      weakPasswords.forEach(password => {
        const result = SecurityUtils.validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should provide specific error messages', () => {
      const password = 'weak';
      const result = SecurityUtils.validatePassword(password);

      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('generateCSRFToken', () => {
    it('should generate a valid UUID', () => {
      const token = SecurityUtils.generateCSRFToken();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const token1 = SecurityUtils.generateCSRFToken();
      const token2 = SecurityUtils.generateCSRFToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateCSRFToken', () => {
    it('should validate correct tokens', () => {
      const token = SecurityUtils.generateCSRFToken();
      expect(SecurityUtils.validateCSRFToken(token, token)).toBe(true);
    });

    it('should reject mismatched tokens', () => {
      const token1 = SecurityUtils.generateCSRFToken();
      const token2 = SecurityUtils.generateCSRFToken();
      expect(SecurityUtils.validateCSRFToken(token1, token2)).toBe(false);
    });
  });
});

describe('Auth Middleware', () => {
  describe('validateAuthInput', () => {
    it('should validate correct authentication input', () => {
      const input = {
        email: 'test@example.com',
        password: 'StrongP@ss123',
        code: '123456',
        recoveryCode: 'ABCD1234-EFGH5678-IJKL9012-MNOP3456'
      };

      const result = AuthMiddleware.validateAuthInput(input);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid authentication input', () => {
      const input = {
        email: 'invalid-email',
        password: 'weak',
        code: '12345', // too short
        recoveryCode: 'invalid-format'
      };

      const result = AuthMiddleware.validateAuthInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle partial input', () => {
      const input = {
        email: 'test@example.com'
        // missing other fields
      };

      const result = AuthMiddleware.validateAuthInput(input);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('hasPermission', () => {
    const adminUser = { id: 'admin-1', role: 'admin' };
    const regularUser = { id: 'user-1', role: 'user' };

    it('should allow admins to access all resources', () => {
      const resources = ['trips', 'users', 'audit_logs', 'system_settings'];
      const actions = ['view', 'create', 'update', 'delete'];

      resources.forEach(resource => {
        actions.forEach(action => {
          expect(AuthMiddleware.hasPermission(adminUser, resource, action)).toBe(true);
        });
      });
    });

    it('should allow users to access their own resources', () => {
      const user = { id: 'user-1', role: 'user' };
      const resourceOwnerId = 'user-1';

      expect(AuthMiddleware.hasPermission(user, 'trips', 'view', resourceOwnerId)).toBe(true);
      expect(AuthMiddleware.hasPermission(user, 'trips', 'update', resourceOwnerId)).toBe(true);
    });

    it('should deny users access to other users resources', () => {
      const user = { id: 'user-1', role: 'user' };
      const resourceOwnerId = 'user-2';

      expect(AuthMiddleware.hasPermission(user, 'trips', 'view', resourceOwnerId)).toBe(false);
      expect(AuthMiddleware.hasPermission(user, 'trips', 'update', resourceOwnerId)).toBe(false);
    });

    it('should allow users to access public resources', () => {
      expect(AuthMiddleware.hasPermission(regularUser, 'trips', 'view')).toBe(true);
      expect(AuthMiddleware.hasPermission(regularUser, 'trips', 'create')).toBe(true);
    });

    it('should deny users access to admin-only resources', () => {
      expect(AuthMiddleware.hasPermission(regularUser, 'users', 'view')).toBe(false);
      expect(AuthMiddleware.hasPermission(regularUser, 'audit_logs', 'view')).toBe(false);
      expect(AuthMiddleware.hasPermission(regularUser, 'system_settings', 'view')).toBe(false);
    });
  });

  describe('generateSessionToken', () => {
    it('should generate a valid session token', () => {
      const token = AuthMiddleware.generateSessionToken();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const token1 = AuthMiddleware.generateSessionToken();
      const token2 = AuthMiddleware.generateSessionToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateSessionToken', () => {
    it('should validate correct session tokens', () => {
      const token = AuthMiddleware.generateSessionToken();
      expect(AuthMiddleware.validateSessionToken(token)).toBe(true);
    });

    it('should reject invalid session tokens', () => {
      const invalidTokens = [
        'invalid-token',
        '12345678-1234-1234-1234-123456789012', // invalid version
        '12345678-1234-1234-1234-12345678901', // too short
        '12345678-1234-1234-1234-1234567890123' // too long
      ];

      invalidTokens.forEach(token => {
        expect(AuthMiddleware.validateSessionToken(token)).toBe(false);
      });
    });
  });
});