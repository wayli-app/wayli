import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
	SecurityUtils,
	applySecurityHeaders,
	validateRequest,
	validateFileUpload,
	sanitizeSQLInput,
	escapeHTML,
	createRateLimitKey,
	DEFAULT_SECURITY_CONFIG
} from '$lib/security/security-middleware';

// --- SecurityUtils tests ---
describe('SecurityUtils', () => {
	it('sanitizeString should remove HTML tags and protocols', () => {
		const result = SecurityUtils.sanitizeString(
			' <script>alert(1)</script> javascript:evil() data:test vbscript:foo'
		);
		expect(result).not.toContain('<');
		expect(result).not.toContain('javascript:');
		expect(result).not.toContain('data:');
		expect(result).not.toContain('vbscript:');
	});

	it('sanitizeObject should deeply sanitize strings', () => {
		const obj = {
			safe: ' hello ',
			nested: { bad: '<img src=x onerror=alert(1)>' }
		};
		const result = SecurityUtils.sanitizeObject(obj) as { safe: string; nested: { bad: string } };
		expect(result.safe).toBe('hello');
		expect(result.nested.bad).not.toContain('<');
	});

	it('validateEmail should accept valid and reject invalid emails', () => {
		expect(SecurityUtils.validateEmail('user@example.com')).toBe(true);
		expect(SecurityUtils.validateEmail('bad..email@example.com')).toBe(false);
		expect(SecurityUtils.validateEmail('user@example.com.')).toBe(false);
		expect(SecurityUtils.validateEmail('not-an-email')).toBe(false);
	});

	it('validatePassword should detect missing rules', () => {
		const result = SecurityUtils.validatePassword('abc');
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);

		const strong = SecurityUtils.validatePassword('Valid123!');
		expect(strong.valid).toBe(true);
	});

	it('generateCSRFToken should return a non-empty string', () => {
		const token = SecurityUtils.generateCSRFToken();
		expect(typeof token).toBe('string');
		expect(token.length).toBeGreaterThan(5);
	});

	it('validateCSRFToken should compare tokens', () => {
		expect(SecurityUtils.validateCSRFToken('a', 'a')).toBe(true);
		expect(SecurityUtils.validateCSRFToken('a', 'b')).toBe(false);
	});
});

// --- applySecurityHeaders tests ---
describe('applySecurityHeaders', () => {
	it('should apply default headers', () => {
		const res = new Response('ok');
		const newRes = applySecurityHeaders(res);
		const headers = newRes.headers;

		expect(headers.get('Content-Security-Policy')).toContain("default-src 'self'");
		expect(headers.get('Strict-Transport-Security')).toContain('max-age');
		expect(headers.get('X-Frame-Options')).toBe('DENY');
	});

	it('should disable certain headers when config is false', () => {
		const cfg = { ...DEFAULT_SECURITY_CONFIG, enableCSP: false, enableHSTS: false };
		const res = applySecurityHeaders(new Response('ok'), cfg);
		expect(res.headers.get('Content-Security-Policy')).toBeNull();
		expect(res.headers.get('Strict-Transport-Security')).toBeNull();
	});
});

// --- validateRequest tests ---
describe('validateRequest', () => {
	const schema = z.object({ name: z.string() });
	const makeEvent = (
		body: string,
		headers: Record<string, string> = { 'content-type': 'application/json' }
	) => ({
		request: new Request('http://localhost', {
			method: 'POST',
			headers,
			body
		})
	});
	type TestEvent = { request: Request };

	it('should validate and sanitize body', async () => {
		const event = makeEvent(JSON.stringify({ name: ' <b>test</b>' }));
		const result = await validateRequest(schema, event as TestEvent);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.name).toBe('test');
		}
	});

	it('should fail if body is missing', async () => {
		const event = makeEvent('');
		const result = await validateRequest(schema, event as TestEvent);
		expect(result.success).toBe(false);
	});

	it('should fail if content-type is not application/json', async () => {
		const event = makeEvent('{}', { 'content-type': 'text/plain' });
		const result = await validateRequest(schema, event as TestEvent);
		expect(result.success).toBe(false);
	});

	it('should fail on invalid JSON', async () => {
		const event = makeEvent('{bad json}');
		const result = await validateRequest(schema, event as TestEvent);
		expect(result.success).toBe(false);
	});

	it('should fail on Zod validation error', async () => {
		const event = makeEvent(JSON.stringify({ wrong: 'field' }));
		const result = await validateRequest(schema, event as TestEvent);
		expect(result.success).toBe(false);
	});
});

// --- validateFileUpload tests ---
describe('validateFileUpload', () => {
	const makeFile = (name: string, type: string, size: number) =>
		new File(['x'.repeat(size)], name, { type });

	it('should accept valid file', () => {
		const file = makeFile('test.png', 'image/png', 1024);
		const res = validateFileUpload(file);
		expect(res.valid).toBe(true);
	});

	it('should reject large file', () => {
		const file = makeFile('big.png', 'image/png', DEFAULT_SECURITY_CONFIG.maxRequestSize + 1);
		const res = validateFileUpload(file);
		expect(res.valid).toBe(false);
	});

	it('should reject disallowed type', () => {
		const file = makeFile('file.txt', 'text/plain', 1024);
		const res = validateFileUpload(file);
		expect(res.valid).toBe(false);
	});

	it('should reject dangerous extension', () => {
		const file = makeFile('bad.exe', 'application/json', 1024);
		const res = validateFileUpload(file);
		expect(res.valid).toBe(false);
	});
});

// --- sanitizeSQLInput tests ---
describe('sanitizeSQLInput', () => {
	it('should remove dangerous characters', () => {
		const input = "'DROP TABLE users;--";
		const result = sanitizeSQLInput(input);
		expect(result).not.toContain("'");
		expect(result).not.toContain('--');
	});
});

// --- escapeHTML tests ---
describe('escapeHTML', () => {
	it('should escape HTML on server', () => {
		const res = escapeHTML('<script>alert(1)</script>');
		expect(res).toContain('&lt;script&gt;');
	});
});

// --- createRateLimitKey tests ---
describe('createRateLimitKey', () => {
	it('should generate key from headers', () => {
		const req = new Request('http://localhost', {
			headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'test' }
		});
		const key = createRateLimitKey(req);
		expect(key).toBe('1.2.3.4:test');
	});

	it('should use defaults if no headers', () => {
		const req = new Request('http://localhost');
		const key = createRateLimitKey(req);
		expect(key).toBe('unknown:unknown');
	});
});
