// Temporarily disabled due to paraglide build issues
// import { deLocalizeUrl } from '$lib/paraglide/runtime';

import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = ({ url }) => url.pathname;
