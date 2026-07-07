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
	created_at: string;
	updated_at: string;
}

export interface CreateTripEntryInput {
	trip_id: string;
	title: string;
	body: string;
	entry_date: string;
}

export interface UpdateTripEntryInput {
	title?: string;
	body?: string;
	entry_date?: string;
}
