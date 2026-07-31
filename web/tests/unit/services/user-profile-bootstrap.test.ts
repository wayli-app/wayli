// /Users/bart/Dev/wayli/web/tests/unit/services/user-profile-bootstrap.test.ts
//
// Unit tests for ensureUserProfile() — the app-side replacement for the
// auth.users trigger that Fluxbase wipes on restart. Verifies the two
// behaviors that were previously untested:
//   1. A user_profiles row is created when missing (signup).
//   2. The first registered user becomes an admin (role: 'admin').
// Plus the no-op, race-handling, and error paths.
//
// Mocks $lib/fluxbase with a controllable chainable query builder so each
// Fluxbase call (select/maybeSingle, count, insert) can be driven independently.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUser = { id: 'user-123', first_name: 'Ada', last_name: 'Lovelace' };

// The mocked fluxbase client must be created via vi.hoisted so it exists when
// the hoisted vi.mock factory runs. `from` is a vi.fn whose implementation is
// swapped per-test to control the query chain (existence check, count, insert).
const { fluxbase } = vi.hoisted(() => ({ fluxbase: { from: vi.fn(), auth: {} as any } }));
vi.mock('$lib/fluxbase', () => ({ fluxbase }));

import { ensureUserProfile } from '$lib/services/session/user-profile-bootstrap';

// Build a chainable table mock from per-call overrides. The select() branch
// distinguishes the count query (opts.head + opts.count) from column selects.
function makeFromImpl(opts: {
	existing: Record<string, any> | null;
	count: number;
	insertData?: Record<string, any> | null;
	insertError?: { message: string };
	refetched?: Record<string, any> | null;
}) {
	let maybeSingleCall = 0;
	const insertArgs: any[] = [];
	const from = () => {
		const api: any = {
			select: vi.fn((cols?: string, so?: any) => {
				if (so && so.head === true && so.count) {
					// The helper destructures { count } directly from this select result.
					return { count: opts.count, error: null };
				}
				// First maybeSingle = existence check; subsequent = post-conflict re-fetch.
				const data = maybeSingleCall++ === 0 ? opts.existing : opts.refetched;
				return {
					eq: vi.fn().mockReturnThis(),
					maybeSingle: vi.fn().mockResolvedValue({ data, error: null })
				};
			}),
			insert: vi.fn((payload: any) => {
				insertArgs.push(payload);
				return {
					select: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: opts.insertData ?? null,
							error: opts.insertError ?? null
						})
					}))
				};
			})
		};
		return api;
	};
	return { from, insertArgs };
}

describe('ensureUserProfile', () => {
	beforeEach(() => {
		fluxbase.from.mockReset();
	});

	it('creates a profile when none exists (signup)', async () => {
		const impl = makeFromImpl({
			existing: null,
			count: 1,
			insertData: { id: mockUser.id, role: 'user', onboarding_completed: false }
		});
		fluxbase.from.mockImplementation(impl.from);

		const result = await ensureUserProfile({
			userId: mockUser.id,
			first_name: mockUser.first_name,
			last_name: mockUser.last_name
		});

		expect(result).not.toBeNull();
		expect(impl.insertArgs).toHaveLength(1);
		expect(impl.insertArgs[0]).toMatchObject({
			id: mockUser.id,
			first_name: 'Ada',
			last_name: 'Lovelace',
			full_name: 'Ada Lovelace',
			onboarding_completed: false
		});
	});

	it('does not insert when a profile already exists', async () => {
		const existing = { id: mockUser.id, role: 'user', onboarding_completed: true };
		const impl = makeFromImpl({ existing, count: 1 });
		fluxbase.from.mockImplementation(impl.from);

		const result = await ensureUserProfile({ userId: mockUser.id });

		expect(result).toEqual(existing);
		expect(impl.insertArgs).toHaveLength(0);
	});

	it('assigns admin role to the first user', async () => {
		const impl = makeFromImpl({
			existing: null,
			count: 0, // ← no profiles yet → first user
			insertData: { id: mockUser.id, role: 'admin' }
		});
		fluxbase.from.mockImplementation(impl.from);

		const result = await ensureUserProfile({ userId: mockUser.id });

		expect(result).toMatchObject({ id: mockUser.id, role: 'admin' });
		expect(impl.insertArgs[0]).toMatchObject({ id: mockUser.id, role: 'admin' });
	});

	it('assigns user role when other profiles already exist', async () => {
		const impl = makeFromImpl({
			existing: null,
			count: 5, // ← other users exist → not first
			insertData: { id: mockUser.id, role: 'user' }
		});
		fluxbase.from.mockImplementation(impl.from);

		const result = await ensureUserProfile({ userId: mockUser.id });

		expect(result).toMatchObject({ id: mockUser.id, role: 'user' });
		expect(impl.insertArgs[0]).toMatchObject({ role: 'user' });
	});

	it('refetches on a primary-key conflict (race handling)', async () => {
		const refetched = { id: mockUser.id, role: 'user', onboarding_completed: true };
		const impl = makeFromImpl({
			existing: null,
			count: 3,
			insertError: { message: 'duplicate key value violates unique constraint (23505)' },
			refetched
		});
		fluxbase.from.mockImplementation(impl.from);

		const result = await ensureUserProfile({ userId: mockUser.id });

		expect(result).toEqual(refetched);
	});

	it('returns null on a hard (non-conflict) insert error', async () => {
		const impl = makeFromImpl({
			existing: null,
			count: 2,
			insertError: { message: 'permission denied for table user_profiles' }
		});
		fluxbase.from.mockImplementation(impl.from);

		const result = await ensureUserProfile({ userId: mockUser.id });

		expect(result).toBeNull();
	});
});
