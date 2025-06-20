import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import type { RequestEvent } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn()
}));

// Mock environment variables
vi.mock('$env/static/private', () => ({
	SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
}));

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
	PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-that-is-long-enough-to-pass-validation'
}));

describe('Admin Users API', () => {
	let mockSupabaseClient: any;
	let mockRequestEvent: any;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Mock Supabase client
		mockSupabaseClient = {
			auth: {
				admin: {
					listUsers: vi.fn()
				}
			}
		};

		(createClient as any).mockReturnValue(mockSupabaseClient);

		// Mock request event
		mockRequestEvent = {
			url: new URL('http://localhost:5173/api/v1/admin/users'),
			locals: {
				getSession: vi.fn(),
				supabase: mockSupabaseClient
			}
		};
	});

	describe('GET /api/v1/admin/users', () => {
		it('should return 401 when user is not authenticated', async () => {
			// Mock unauthenticated session
			mockRequestEvent.locals.getSession.mockResolvedValue(null);

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		it('should return 403 when user is not an admin', async () => {
			// Mock authenticated but non-admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'user-123',
					user_metadata: {
						role: 'user' // Not admin
					}
				}
			});

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toBe('Forbidden');
		});

		it('should return users when user is authenticated admin', async () => {
			// Mock authenticated admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'admin-123',
					user_metadata: {
						role: 'admin'
					}
				}
			});

			// Mock successful Supabase response
			mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
				data: {
					users: [
						{
							id: 'user-1',
							email: 'user1@example.com',
							user_metadata: {
								full_name: 'User One',
								role: 'user'
							},
							created_at: '2023-01-01T00:00:00Z'
						},
						{
							id: 'user-2',
							email: 'user2@example.com',
							user_metadata: {
								full_name: 'User Two',
								role: 'admin'
							},
							created_at: '2023-01-02T00:00:00Z'
						}
					]
				},
				error: null
			});

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(2);
			expect(data.users[0]).toEqual({
				id: 'user-1',
				email: 'user1@example.com',
				full_name: 'User One',
				avatar_url: undefined,
				is_admin: false,
				created_at: '2023-01-01T00:00:00Z',
				user_metadata: {
					full_name: 'User One',
					role: 'user'
				}
			});
			expect(data.pagination).toEqual({
				page: 1,
				limit: 10,
				total: 2,
				totalPages: 1,
				hasNext: false,
				hasPrev: false
			});
		});

		it('should filter users by search term', async () => {
			// Mock authenticated admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'admin-123',
					user_metadata: {
						role: 'admin'
					}
				}
			});

			// Mock Supabase response with multiple users
			mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
				data: {
					users: [
						{
							id: 'user-1',
							email: 'john@example.com',
							user_metadata: {
								full_name: 'John Doe',
								role: 'user'
							},
							created_at: '2023-01-01T00:00:00Z'
						},
						{
							id: 'user-2',
							email: 'jane@example.com',
							user_metadata: {
								full_name: 'Jane Smith',
								role: 'user'
							},
							created_at: '2023-01-02T00:00:00Z'
						},
						{
							id: 'user-3',
							email: 'bob@example.com',
							user_metadata: {
								full_name: 'Bob Johnson',
								role: 'user'
							},
							created_at: '2023-01-03T00:00:00Z'
						}
					]
				},
				error: null
			});

			// Add search parameter to URL - use a more specific search term
			mockRequestEvent.url = new URL('http://localhost:5173/api/v1/admin/users?search=jane');

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(1);
			expect(data.users[0].email).toBe('jane@example.com');
			expect(data.pagination.total).toBe(1);
		});

		it('should handle pagination correctly', async () => {
			// Mock authenticated admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'admin-123',
					user_metadata: {
						role: 'admin'
					}
				}
			});

			// Mock Supabase response with many users
			const mockUsers = Array.from({ length: 25 }, (_, i) => ({
				id: `user-${i + 1}`,
				email: `user${i + 1}@example.com`,
				user_metadata: {
					full_name: `User ${i + 1}`,
					role: 'user'
				},
				created_at: '2023-01-01T00:00:00Z'
			}));

			mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
				data: {
					users: mockUsers
				},
				error: null
			});

			// Request page 2 with limit 10
			mockRequestEvent.url = new URL('http://localhost:5173/api/v1/admin/users?page=2&limit=10');

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(10);
			expect(data.users[0].id).toBe('user-11'); // Second page starts at user 11
			expect(data.pagination).toEqual({
				page: 2,
				limit: 10,
				total: 25,
				totalPages: 3,
				hasNext: true,
				hasPrev: true
			});
		});

		it('should handle Supabase errors gracefully', async () => {
			// Mock authenticated admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'admin-123',
					user_metadata: {
						role: 'admin'
					}
				}
			});

			// Mock Supabase error
			mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
				data: { users: [] },
				error: { message: 'Database connection failed' }
			});

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toEqual([]);
			expect(data.pagination).toEqual({
				page: 1,
				limit: 10,
				total: 0,
				totalPages: 0,
				hasNext: false,
				hasPrev: false
			});
		});

		it('should perform case-insensitive search', async () => {
			// Mock authenticated admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'admin-123',
					user_metadata: {
						role: 'admin'
					}
				}
			});

			// Mock Supabase response
			mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
				data: {
					users: [
						{
							id: 'user-1',
							email: 'JOHN@example.com',
							user_metadata: {
								full_name: 'JOHN DOE',
								role: 'user'
							},
							created_at: '2023-01-01T00:00:00Z'
						},
						{
							id: 'user-2',
							email: 'jane@example.com',
							user_metadata: {
								full_name: 'Jane Smith',
								role: 'user'
							},
							created_at: '2023-01-02T00:00:00Z'
						}
					]
				},
				error: null
			});

			// Search with lowercase
			mockRequestEvent.url = new URL('http://localhost:5173/api/v1/admin/users?search=john');

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(1);
			expect(data.users[0].email).toBe('JOHN@example.com');
		});

		it('should handle users with missing metadata gracefully', async () => {
			// Mock authenticated admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'admin-123',
					user_metadata: {
						role: 'admin'
					}
				}
			});

			// Mock Supabase response with incomplete user data
			mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
				data: {
					users: [
						{
							id: 'user-1',
							email: 'user1@example.com',
							user_metadata: null, // Missing metadata
							created_at: '2023-01-01T00:00:00Z'
						},
						{
							id: 'user-2',
							email: 'user2@example.com',
							user_metadata: {
								// Missing full_name and role
							},
							created_at: '2023-01-02T00:00:00Z'
						}
					]
				},
				error: null
			});

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(2);
			expect(data.users[0]).toEqual({
				id: 'user-1',
				email: 'user1@example.com',
				full_name: undefined,
				avatar_url: undefined,
				is_admin: false,
				created_at: '2023-01-01T00:00:00Z',
				user_metadata: null
			});
		});

		it('should handle empty search results', async () => {
			// Mock authenticated admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'admin-123',
					user_metadata: {
						role: 'admin'
					}
				}
			});

			// Mock Supabase response with users
			mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
				data: {
					users: [
						{
							id: 'user-1',
							email: 'john@example.com',
							user_metadata: {
								full_name: 'John Doe',
								role: 'user'
							},
							created_at: '2023-01-01T00:00:00Z'
						}
					]
				},
				error: null
			});

			// Search for non-existent user
			mockRequestEvent.url = new URL('http://localhost:5173/api/v1/admin/users?search=nonexistent');

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.users).toHaveLength(0);
			expect(data.pagination.total).toBe(0);
		});

		it('should handle default pagination parameters', async () => {
			// Mock authenticated admin session
			mockRequestEvent.locals.getSession.mockResolvedValue({
				user: {
					id: 'admin-123',
					user_metadata: {
						role: 'admin'
					}
				}
			});

			// Mock Supabase response
			mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
				data: {
					users: [
						{
							id: 'user-1',
							email: 'user1@example.com',
							user_metadata: {
								full_name: 'User One',
								role: 'user'
							},
							created_at: '2023-01-01T00:00:00Z'
						}
					]
				},
				error: null
			});

			// No pagination parameters in URL
			mockRequestEvent.url = new URL('http://localhost:5173/api/v1/admin/users');

			const response = await GET(mockRequestEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.pagination).toEqual({
				page: 1,
				limit: 10,
				total: 1,
				totalPages: 1,
				hasNext: false,
				hasPrev: false
			});
		});
	});
});