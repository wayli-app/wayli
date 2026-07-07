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
