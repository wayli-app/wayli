import { describe, it, expect } from 'vitest';

describe('Basic Functionality Tests', () => {
	describe('String Operations', () => {
		it('should concatenate strings', () => {
			const str1 = 'Hello';
			const str2 = 'World';
			const result = str1 + ' ' + str2;
			expect(result).toBe('Hello World');
		});

		it('should find substring', () => {
			const text = 'Hello World';
			expect(text.includes('World')).toBe(true);
			expect(text.includes('Universe')).toBe(false);
		});

		it('should convert to uppercase', () => {
			const text = 'hello world';
			expect(text.toUpperCase()).toBe('HELLO WORLD');
		});

		it('should convert to lowercase', () => {
			const text = 'HELLO WORLD';
			expect(text.toLowerCase()).toBe('hello world');
		});

		it('should trim whitespace', () => {
			const text = '  hello world  ';
			expect(text.trim()).toBe('hello world');
		});
	});

	describe('Array Operations', () => {
		it('should filter arrays', () => {
			const numbers = [1, 2, 3, 4, 5, 6];
			const evenNumbers = numbers.filter((n) => n % 2 === 0);
			expect(evenNumbers).toEqual([2, 4, 6]);
		});

		it('should map arrays', () => {
			const numbers = [1, 2, 3];
			const doubled = numbers.map((n) => n * 2);
			expect(doubled).toEqual([2, 4, 6]);
		});

		it('should reduce arrays', () => {
			const numbers = [1, 2, 3, 4];
			const sum = numbers.reduce((acc, n) => acc + n, 0);
			expect(sum).toBe(10);
		});

		it('should find elements', () => {
			const users = [
				{ id: 1, name: 'Alice' },
				{ id: 2, name: 'Bob' },
				{ id: 3, name: 'Charlie' }
			];

			const bob = users.find((user) => user.name === 'Bob');
			expect(bob).toEqual({ id: 2, name: 'Bob' });
		});

		it('should check if all elements match condition', () => {
			const numbers = [2, 4, 6, 8];
			const allEven = numbers.every((n) => n % 2 === 0);
			expect(allEven).toBe(true);
		});

		it('should check if any element matches condition', () => {
			const numbers = [1, 3, 4, 7];
			const hasEven = numbers.some((n) => n % 2 === 0);
			expect(hasEven).toBe(true);
		});
	});

	describe('Object Operations', () => {
		it('should merge objects', () => {
			const obj1 = { a: 1, b: 2 };
			const obj2 = { c: 3, d: 4 };
			const merged = { ...obj1, ...obj2 };
			expect(merged).toEqual({ a: 1, b: 2, c: 3, d: 4 });
		});

		it('should get object keys', () => {
			const obj = { a: 1, b: 2, c: 3 };
			const keys = Object.keys(obj);
			expect(keys).toEqual(['a', 'b', 'c']);
		});

		it('should get object values', () => {
			const obj = { a: 1, b: 2, c: 3 };
			const values = Object.values(obj);
			expect(values).toEqual([1, 2, 3]);
		});

		it('should get object entries', () => {
			const obj = { a: 1, b: 2 };
			const entries = Object.entries(obj);
			expect(entries).toEqual([
				['a', 1],
				['b', 2]
			]);
		});
	});

	describe('Date Operations', () => {
		it('should create date objects', () => {
			const date = new Date('2024-01-01');
			expect(date.getFullYear()).toBe(2024);
			expect(date.getMonth()).toBe(0); // January is 0
			expect(date.getDate()).toBe(1);
		});

		it('should format dates', () => {
			const date = new Date('2024-01-01');
			const formatted = date.toISOString().split('T')[0];
			expect(formatted).toBe('2024-01-01');
		});

		it('should add days to date', () => {
			const date = new Date('2024-01-01');
			date.setDate(date.getDate() + 1);
			expect(date.getDate()).toBe(2);
		});
	});

	describe('Math Operations', () => {
		it('should perform basic arithmetic', () => {
			expect(2 + 2).toBe(4);
			expect(5 - 3).toBe(2);
			expect(4 * 3).toBe(12);
			expect(10 / 2).toBe(5);
		});

		it('should round numbers', () => {
			expect(Math.round(3.7)).toBe(4);
			expect(Math.round(3.2)).toBe(3);
			expect(Math.floor(3.7)).toBe(3);
			expect(Math.ceil(3.2)).toBe(4);
		});

		it('should find min and max', () => {
			const numbers = [1, 5, 3, 9, 2];
			expect(Math.min(...numbers)).toBe(1);
			expect(Math.max(...numbers)).toBe(9);
		});

		it('should generate random numbers', () => {
			const random = Math.random();
			expect(random).toBeGreaterThanOrEqual(0);
			expect(random).toBeLessThan(1);
		});
	});

	describe('Regular Expressions', () => {
		it('should validate email format', () => {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

			expect(emailRegex.test('test@example.com')).toBe(true);
			expect(emailRegex.test('invalid-email')).toBe(false);
			expect(emailRegex.test('test@')).toBe(false);
			expect(emailRegex.test('@example.com')).toBe(false);
		});

		it('should validate date format', () => {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

			expect(dateRegex.test('2024-01-01')).toBe(true);
			expect(dateRegex.test('2024/01/01')).toBe(false);
			expect(dateRegex.test('01-01-2024')).toBe(false);
		});

		it('should extract matches', () => {
			const text = 'Hello World, Hello Universe';
			const matches = text.match(/Hello/g);
			expect(matches).toEqual(['Hello', 'Hello']);
		});

		it('should replace text', () => {
			const text = 'Hello World';
			const replaced = text.replace('World', 'Universe');
			expect(replaced).toBe('Hello Universe');
		});
	});

	describe('Error Handling', () => {
		it('should catch and handle errors', () => {
			let errorCaught = false;

			try {
				throw new Error('Test error');
			} catch (error) {
				errorCaught = true;
				expect(error instanceof Error).toBe(true);
				expect((error as Error).message).toBe('Test error');
			}

			expect(errorCaught).toBe(true);
		});

		it('should handle async errors', async () => {
			const asyncFunction = async () => {
				throw new Error('Async error');
			};

			let errorCaught = false;

			try {
				await asyncFunction();
			} catch (error) {
				errorCaught = true;
				expect(error instanceof Error).toBe(true);
				expect((error as Error).message).toBe('Async error');
			}

			expect(errorCaught).toBe(true);
		});
	});

	describe('Async Operations', () => {
		it('should handle promises', async () => {
			const promise = Promise.resolve('success');
			const result = await promise;
			expect(result).toBe('success');
		});

		it('should handle promise rejection', async () => {
			const promise = Promise.reject(new Error('failure'));

			let errorCaught = false;
			try {
				await promise;
			} catch (error) {
				errorCaught = true;
				expect((error as Error).message).toBe('failure');
			}

			expect(errorCaught).toBe(true);
		});

		it('should handle multiple promises', async () => {
			const promises = [Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)];

			const results = await Promise.all(promises);
			expect(results).toEqual([1, 2, 3]);
		});
	});

	describe('Array Type Checking', () => {
		it('should check array types', () => {
			expect(Array.isArray([])).toBe(true);
			expect(Array.isArray([1, 2, 3])).toBe(true);
			expect(Array.isArray({})).toBe(false);
			expect(Array.isArray(null)).toBe(false);
		});
	});
});
