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
}
