export interface Place {
	id: string;
	user_id: string;
	title: string;
	type: string;
	coordinates: string; // "lat, lng" format
	description?: string;
	address?: string;
	location?: string; // City, Country
	markerType?: string;
	markerColor?: string;
	labels?: string[];
	favorite?: boolean;
	rating?: number;
	image_url?: string | null;
	image_attribution?: { photographer?: string; photographer_url?: string; pexels_url?: string } | null;
	created_at: string;
	updated_at: string;
}

export interface CreatePlaceData {
	title: string;
	type: string;
	coordinates: string;
	description?: string;
	address?: string;
	location?: string;
	markerType?: string;
	markerColor?: string;
	labels?: string[];
	favorite?: boolean;
	rating?: number;
}

export interface UpdatePlaceData {
	title?: string;
	type?: string;
	coordinates?: string;
	description?: string;
	address?: string;
	location?: string;
	markerType?: string;
	markerColor?: string;
	labels?: string[];
	favorite?: boolean;
	rating?: number;
	image_url?: string | null;
	image_attribution?: object | null;
}
