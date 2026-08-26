/**
 * Trip journal entry — a dated markdown post within a trip.
 *
 * Content is an ordered block list (`blocks`, the source of truth): text
 * blocks (markdown) and photo blocks (ordered trip_media ids). `body` is the
 * flat markdown projection of those blocks (photo blocks become inline
 * `wayli-media:` tokens) kept for legacy clients, search and excerpts.
 */

export interface TextBlock {
	t: 'text';
	md: string;
}

export interface PhotosBlock {
	t: 'photos';
	ids: string[];
}

export type EntryBlock = TextBlock | PhotosBlock;

export interface EntryBlocks {
	v: number;
	blocks: EntryBlock[];
}

export interface TripEntry {
	id: string;
	trip_id: string;
	user_id: string;
	title: string;
	body: string;
	blocks?: EntryBlocks | null;
	entry_date: string;
	end_date?: string | null;
	status?: string;
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
	blocks?: EntryBlocks | null;
	entry_date: string;
	end_date?: string | null;
	status?: string;
	cover_media_id?: string | null;
	highlight_start?: string | null;
	highlight_end?: string | null;
}

export interface UpdateTripEntryInput {
	title?: string;
	body?: string;
	blocks?: EntryBlocks | null;
	entry_date?: string;
	end_date?: string | null;
	status?: string;
	cover_media_id?: string | null;
	highlight_start?: string | null;
	highlight_end?: string | null;
}
