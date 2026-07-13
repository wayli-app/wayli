/**
 * Trip journal entry — a dated markdown post within a trip.
 */

export interface TripEntry {
	id: string;
	trip_id: string;
	user_id: string;
	title: string;
	body: string; // markdown source
	entry_date: string; // ISO date (YYYY-MM-DD)
	highlight_start?: string | null; // ISO timestamp — narrows the map highlight
	highlight_end?: string | null; // ISO timestamp — narrows the map highlight
	created_at: string;
	updated_at: string;
}

export interface CreateTripEntryInput {
	trip_id: string;
	title: string;
	body: string;
	entry_date: string;
	highlight_start?: string | null;
	highlight_end?: string | null;
}

export interface UpdateTripEntryInput {
	title?: string;
	body?: string;
	entry_date?: string;
	highlight_start?: string | null;
	highlight_end?: string | null;
}
