import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ params }) => {
	throw redirect(307, `/dashboard/travel?trip=${params.tripId}`);
};
