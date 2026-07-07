/**
 * TripEntryService — CRUD for trip journal entries.
 * Follows the existing service pattern (export functions, Fluxbase SDK, RLS-scoped).
 */

import { fluxbase } from '$lib/fluxbase';
import type {
	TripEntry,
	CreateTripEntryInput,
	UpdateTripEntryInput
} from '$lib/types/journal.types';

/**
 * List all entries for a trip, ordered by entry_date.
 */
export async function listEntries(tripId: string): Promise<TripEntry[]> {
	const { data, error } = await fluxbase
		.from<TripEntry>('trip_entries')
		.select('*')
		.eq('trip_id', tripId)
		.order('entry_date', { ascending: true });

	if (error) throw new Error(error.message);
	return (data as unknown as TripEntry[]) ?? [];
}

/**
 * List ALL entries for a user across ALL trips, with trip context joined.
 * Ordered by entry_date DESC (most recent first) — for the journal feed.
 */
export async function listAllEntries(): Promise<
	Array<
		TripEntry & {
			trip_title: string;
			trip_start_date: string;
			trip_end_date: string;
			trip_image_url: string | null;
		}
	>
> {
	const { data, error } = await fluxbase
		.from('trip_entries')
		.select(
			`
			*,
			trips!inner (
				title,
				start_date,
				end_date,
				image_url
			)
		`
		)
		.order('entry_date', { ascending: false });

	if (error) throw new Error(error.message);

	const rows = (data as any[]) ?? [];
	return rows.map((row) => ({
		id: row.id,
		trip_id: row.trip_id,
		user_id: row.user_id,
		title: row.title,
		body: row.body,
		entry_date: row.entry_date,
		created_at: row.created_at,
		updated_at: row.updated_at,
		trip_title: row.trips?.title ?? 'Unknown trip',
		trip_start_date: row.trips?.start_date ?? '',
		trip_end_date: row.trips?.end_date ?? '',
		trip_image_url: row.trips?.image_url ?? null
	}));
}

/**
 * Get a single entry by ID.
 */
export async function getEntry(entryId: string): Promise<TripEntry | null> {
	const { data, error } = await fluxbase
		.from<TripEntry>('trip_entries')
		.select('*')
		.eq('id', entryId)
		.single();

	if (error) return null;
	return data as unknown as TripEntry;
}

/**
 * Create a new journal entry. RLS ensures the user owns the parent trip.
 */
export async function createEntry(userId: string, input: CreateTripEntryInput): Promise<TripEntry> {
	const { data, error } = await fluxbase
		.from('trip_entries')
		.insert({
			trip_id: input.trip_id,
			user_id: userId,
			title: input.title,
			body: input.body,
			entry_date: input.entry_date
		})
		.select('*')
		.single();

	if (error) throw new Error(error.message);
	return data as unknown as TripEntry;
}

/**
 * Update an existing entry. RLS ensures ownership.
 */
export async function updateEntry(
	entryId: string,
	updates: UpdateTripEntryInput
): Promise<TripEntry> {
	const { data, error } = await fluxbase
		.from('trip_entries')
		.update({ ...updates, updated_at: new Date().toISOString() })
		.eq('id', entryId)
		.select('*')
		.single();

	if (error) throw new Error(error.message);
	return data as unknown as TripEntry;
}

/**
 * Delete an entry. RLS ensures ownership.
 */
export async function deleteEntry(entryId: string): Promise<void> {
	const { error } = await fluxbase.from('trip_entries').delete().eq('id', entryId);
	if (error) throw new Error(error.message);
}
