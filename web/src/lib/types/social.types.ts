export interface TripComment {
	id: string;
	trip_id: string;
	entry_id: string | null;
	user_id: string;
	body: string;
	created_at: string;
	updated_at: string;
	// Joined from public_profiles
	author_name?: string | null;
	author_avatar?: string | null;
}

export interface TripLike {
	id: string;
	trip_id: string;
	user_id: string;
	created_at: string;
}
