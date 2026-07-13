/**
 * Trip journal entry — a dated markdown post within a trip.
 */

export interface TripEntry {
	id: string;
	trip_id: string;
	user_id: string;
	title: string;
	body: string;
	entry_date: string;
	end_date?: string | null;
	cover_media_id?: string | null;
	highlight_start?: string | null;
	highlight_end?: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateTripEntryInput {
	trip_id: string;
	title: string;
	body: string;
	entry_date: string;
	end_date?: string | null;
	cover_media_id?: string | null;
	highlight_start?: string | null;
	highlight_end?: string | null;
}

export interface UpdateTripEntryInput {
	title?: string;
	body?: string;
	entry_date?: string;
	end_date?: string | null;
	cover_media_id?: string | null;
	highlight_start?: string | null;
	highlight_end?: string | null;
}
