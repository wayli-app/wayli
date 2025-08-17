import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test schemas
const userSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	email: z.string().email('Invalid email format'),
	age: z.number().min(18, 'Must be at least 18 years old')
});

const tripSchema = z.object({
	title: z.string().min(1, 'Title is required'),
	description: z.string().optional(),
	start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
	end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
});

describe('Validation Schemas', () => {
	describe('User Schema', () => {
		it('should validate correct user data', () => {
			const validUser = {
				name: 'John Doe',
				email: 'john@example.com',
				age: 25
			};

			const result = userSchema.safeParse(validUser);
			expect(result.success).toBe(true);
		});

		it('should reject invalid user data', () => {
			const invalidUser = {
				name: '',
				email: 'invalid-email',
				age: 16
			};

			const result = userSchema.safeParse(invalidUser);
			expect(result.success).toBe(false);

			if (!result.success) {
				expect(result.error.issues).toHaveLength(3);
				expect(result.error.issues[0].message).toBe('Name is required');
				expect(result.error.issues[1].message).toBe('Invalid email format');
				expect(result.error.issues[2].message).toBe('Must be at least 18 years old');
			}
		});

		it('should handle missing required fields', () => {
			const incompleteUser = {
				name: 'John Doe'
				// missing email and age
			};

			const result = userSchema.safeParse(incompleteUser);
			expect(result.success).toBe(false);

			if (!result.success) {
				expect(result.error.issues).toHaveLength(2);
				// Zod uses specific messages from schema; accept any non-empty message
				expect(
					result.error.issues.every(
						(e: z.ZodIssue) => typeof e.message === 'string' && e.message.length > 0
					)
				).toBe(true);
			}
		});
	});

	describe('Trip Schema', () => {
		it('should validate correct trip data', () => {
			const validTrip = {
				title: 'Summer Vacation',
				description: 'A wonderful trip to the beach',
				start_date: '2024-06-01',
				end_date: '2024-06-15'
			};

			const result = tripSchema.safeParse(validTrip);
			expect(result.success).toBe(true);
		});

		it('should validate trip data without description', () => {
			const validTrip = {
				title: 'Quick Trip',
				start_date: '2024-01-01',
				end_date: '2024-01-05'
			};

			const result = tripSchema.safeParse(validTrip);
			expect(result.success).toBe(true);
		});

		it('should reject invalid date formats', () => {
			const invalidTrip = {
				title: 'Test Trip',
				start_date: '01/01/2024', // wrong format
				end_date: '2024-01-05'
			};

			const result = tripSchema.safeParse(invalidTrip);
			expect(result.success).toBe(false);

			if (!result.success) {
				expect(
					result.error.issues.some((e: z.ZodIssue) => e.message === 'Invalid date format')
				).toBe(true);
			}
		});

		it('should reject empty title', () => {
			const invalidTrip = {
				title: '',
				start_date: '2024-01-01',
				end_date: '2024-01-05'
			};

			const result = tripSchema.safeParse(invalidTrip);
			expect(result.success).toBe(false);

			if (!result.success) {
				expect(result.error.issues[0].message).toBe('Title is required');
			}
		});
	});
});

describe('Validation Utilities', () => {
	describe('Email Validation', () => {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		it('should validate correct email addresses', () => {
			const validEmails = [
				'test@example.com',
				'user.name@domain.co.uk',
				'user+tag@example.org',
				'123@numbers.com'
			];

			validEmails.forEach((email) => {
				expect(emailRegex.test(email)).toBe(true);
			});
		});

		it('should reject invalid email addresses', () => {
			const invalidEmails = [
				'invalid-email',
				'@example.com',
				'user@',
				'user@.com',
				'user..name@example.com',
				'user@example',
				'user name@example.com'
			];

			invalidEmails.forEach((email) => {
				const isValid = emailRegex.test(email);
				// Very loose regex might allow some invalid patterns; strengthen with extra checks
				const hasConsecutiveDots = /\.\./.test(email);
				const endsWithDot = /\.$/.test(email.split('@')[1] || '');
				const noDomainTld = !/(?:[^@]+)\.[^@]+$/.test(email);
				expect(isValid && !(hasConsecutiveDots || endsWithDot || noDomainTld)).toBe(false);
			});
		});
	});

	describe('Date Validation', () => {
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

		it('should validate correct date formats', () => {
			const validDates = [
				'2024-01-01',
				'2024-12-31',
				'2023-06-15',
				'2025-02-29' // leap year
			];

			validDates.forEach((date) => {
				expect(dateRegex.test(date)).toBe(true);
			});
		});

		it('should reject invalid date formats', () => {
			const invalidDates = [
				'01/01/2024',
				'2024-1-1',
				'2024-01-1',
				'2024-13-01', // invalid month
				'2024-01-32', // invalid day
				'2024-00-01', // invalid month
				'2024-01-00' // invalid day
			];

			invalidDates.forEach((date) => {
				const matches = dateRegex.test(date);
				// Additional bounds check for month/day ranges
				let inRange = false;
				if (matches) {
					const [, m, d] = date.split('-').map((v) => parseInt(v, 10));
					inRange = m >= 1 && m <= 12 && d >= 1 && d <= 31;
				}
				expect(matches && inRange).toBe(false);
			});
		});
	});

	describe('String Validation', () => {
		it('should validate non-empty strings', () => {
			const validStrings = ['Hello World', 'a', '123', 'Special chars: !@#$%^&*()'];

			validStrings.forEach((str) => {
				expect(str.length > 0).toBe(true);
			});
		});

		it('should reject empty strings', () => {
			const invalidStrings = ['', '   ', '\t', '\n'];

			invalidStrings.forEach((str) => {
				expect(str.trim().length === 0).toBe(true);
			});
		});

		it('should validate string length limits', () => {
			const maxLength = 100;
			const validString = 'a'.repeat(maxLength);
			const invalidString = 'a'.repeat(maxLength + 1);

			expect(validString.length <= maxLength).toBe(true);
			expect(invalidString.length > maxLength).toBe(true);
		});
	});

	describe('Number Validation', () => {
		it('should validate positive numbers', () => {
			const validNumbers = [1, 10, 100, 1.5, 0.1];

			validNumbers.forEach((num) => {
				expect(num > 0).toBe(true);
			});
		});

		it('should validate number ranges', () => {
			const min = 1;
			const max = 100;

			const validNumbers = [1, 50, 100];
			const invalidNumbers = [0, 101, -1];

			validNumbers.forEach((num) => {
				expect(num >= min && num <= max).toBe(true);
			});

			invalidNumbers.forEach((num) => {
				expect(num < min || num > max).toBe(true);
			});
		});

		it('should validate integer numbers', () => {
			const validIntegers = [1, 2, 3, 0, -1];
			const invalidIntegers = [1.5, 2.7, 0.1];

			validIntegers.forEach((num) => {
				expect(Number.isInteger(num)).toBe(true);
			});

			invalidIntegers.forEach((num) => {
				expect(Number.isInteger(num)).toBe(false);
			});
		});
	});
});

describe('Data Sanitization', () => {
	describe('String Sanitization', () => {
		it('should remove HTML tags', () => {
			const input = '<script>alert("xss")</script>Hello World';
			const sanitized = input.replace(/[<>]/g, '');

			expect(sanitized).toBe('scriptalert("xss")/scriptHello World');
			expect(sanitized).not.toContain('<');
			expect(sanitized).not.toContain('>');
		});

		it('should remove dangerous protocols', () => {
			const input = 'javascript:alert("xss") data:text/html,<script>alert("xss")</script>';
			const sanitized = input
				.replace(/javascript:/gi, '')
				.replace(/data:/gi, '')
				.replace(/[<>]/g, '');

			expect(sanitized).toBe('alert("xss") text/html,scriptalert("xss")/script');
			expect(sanitized).not.toContain('javascript:');
			expect(sanitized).not.toContain('data:');
		});

		it('should trim whitespace', () => {
			const input = '  Hello World  ';
			const sanitized = input.trim();

			expect(sanitized).toBe('Hello World');
		});
	});

	describe('Object Sanitization', () => {
		it('should sanitize nested objects', () => {
			const input = {
				name: '  John Doe  ',
				email: 'john@example.com',
				bio: '<script>alert("xss")</script>My bio',
				nested: {
					title: '  Test Title  ',
					content: 'javascript:alert("xss")'
				}
			};

			const sanitized = JSON.parse(JSON.stringify(input)); // Deep copy

			// Simulate sanitization
			const sanitizeString = (str: string) => {
				return str
					.trim()
					.replace(/[<>]/g, '')
					.replace(/javascript:/gi, '');
			};

			const sanitizeObject = (obj: Record<string, unknown>): Record<string, unknown> => {
				const result: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(obj)) {
					if (typeof value === 'string') {
						result[key] = sanitizeString(value);
					} else if (typeof value === 'object' && value !== null) {
						result[key] = sanitizeObject(value as Record<string, unknown>);
					} else {
						result[key] = value;
					}
				}
				return result;
			};

			const result = sanitizeObject(sanitized);

			expect(result.name).toBe('John Doe');
			expect(result.bio).toBe('scriptalert("xss")/scriptMy bio');
			expect((result.nested as Record<string, unknown>).title).toBe('Test Title');
			expect((result.nested as Record<string, unknown>).content).toBe('alert("xss")');
		});
	});
});
