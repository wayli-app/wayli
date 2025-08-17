import { supabase } from '$lib/core/supabase/client';

import type { Place, CreatePlaceData } from '$lib/types/want-to-visit.types';

export class WantToVisitService {
	/**
	 * Get all want-to-visit places for the current user
	 */
	static async getPlaces(): Promise<Place[]> {
		const { data, error } = await supabase
			.from('want_to_visit_places')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching want-to-visit places:', error);
			throw new Error('Failed to fetch places');
		}

		// Map database column names to frontend property names
		return (data || []).map((place) => ({
			...place,
			markerType: place.marker_type,
			markerColor: place.marker_color
		}));
	}

	/**
	 * Add a new want-to-visit place
	 */
	static async addPlace(place: CreatePlaceData): Promise<Place> {
		// Get current user ID
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user) {
			throw new Error('User not authenticated');
		}

		const { data, error } = await supabase
			.from('want_to_visit_places')
			.insert({
				user_id: user.id,
				title: place.title,
				type: place.type,
				coordinates: place.coordinates,
				description: place.description,
				address: place.address,
				location: place.location,
				marker_type: place.markerType,
				marker_color: place.markerColor,
				labels: place.labels,
				favorite: place.favorite
			})
			.select()
			.single();

		if (error) {
			console.error('Error adding want-to-visit place:', error);
			throw new Error('Failed to add place');
		}

		// Map database column names to frontend property names
		return {
			...data,
			markerType: data.marker_type,
			markerColor: data.marker_color
		};
	}

	/**
	 * Update an existing want-to-visit place
	 */
	static async updatePlace(id: string, updates: Partial<Place>): Promise<Place> {
		const { data, error } = await supabase
			.from('want_to_visit_places')
			.update({
				title: updates.title,
				type: updates.type,
				coordinates: updates.coordinates,
				description: updates.description,
				address: updates.address,
				location: updates.location,
				marker_type: updates.markerType,
				marker_color: updates.markerColor,
				labels: updates.labels,
				favorite: updates.favorite
			})
			.eq('id', id)
			.select()
			.single();

		if (error) {
			console.error('Error updating want-to-visit place:', error);
			throw new Error('Failed to update place');
		}

		// Map database column names to frontend property names
		return {
			...data,
			markerType: data.marker_type,
			markerColor: data.marker_color
		};
	}

	/**
	 * Delete a want-to-visit place
	 */
	static async deletePlace(id: string): Promise<void> {
		const { error } = await supabase.from('want_to_visit_places').delete().eq('id', id);

		if (error) {
			console.error('Error deleting want-to-visit place:', error);
			throw new Error('Failed to delete place');
		}
	}

	/**
	 * Toggle favorite status of a place
	 */
	static async toggleFavorite(id: string, favorite: boolean): Promise<Place> {
		const { data, error } = await supabase
			.from('want_to_visit_places')
			.update({ favorite })
			.eq('id', id)
			.select()
			.single();

		if (error) {
			console.error('Error toggling favorite:', error);
			throw new Error('Failed to update favorite status');
		}

		// Map database column names to frontend property names
		return {
			...data,
			markerType: data.marker_type,
			markerColor: data.marker_color
		};
	}
}
