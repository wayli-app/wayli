/**
 * Synthetic data seeder for screenshot generation.
 *
 * Populates a running Wayli instance with DETERMINISTIC, FAKE data so the
 * screenshot capture script has something to photograph — no real location
 * data, no user_data.zip. Re-running produces identical output.
 *
 * Prerequisites:
 *   - A running Wayli stack (web + Fluxbase + Postgres), e.g. `bun run dev:all`
 *   - web/.env with FLUXBASE_PUBLIC_BASE_URL, PUBLIC_FLUXBASE_ANON_KEY,
 *     FLUXBASE_SERVICE_ROLE_KEY
 *
 * Usage (from web/):
 *   bun run scripts/seed-screenshots.ts
 *
 * Env overrides:
 *   WAYLI_SEED_EMAIL          (default: screenshots-demo@wayli.app)
 *   WAYLI_SEED_PASSWORD       (default: wayli-screenshots-demo!)
 *   WAYLI_SEED_USERNAME       (default: wayli-demo)
 *
 * The script is idempotent: it wipes the demo user's rows before inserting.
 *
 * @fluxbase:none — standalone Node/Bun script, not a Fluxbase job.
 */

/* oxlint-disable no-await-in-loop -- sequential seeding is intentional: each
   step depends on the rows created by the previous one (user → profile →
   trips → tracker_data → entries…). */
/* oxlint-disable consistent-function-scoping -- standalone helper utilities. */

import { createClient } from '@nimbleflux/fluxbase-sdk';

// Load web/.env manually (avoid a dotenv dependency in a standalone script).
const envFile = new URL('../.env', import.meta.url);
try {
	const text = await Bun.file(envFile).text();
	for (const line of text.split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (!m) continue;
		const [, key, raw] = m;
		const val = raw.replace(/^["']|["']$/g, '');
		if (!(key in process.env)) process.env[key] = val;
	}
} catch {
	// .env optional if vars are exported in the shell.
}

// ── Config ──────────────────────────────────────────────────────────────────

// Fluxbase URL: prefer the explicit host override, then .env. The .env ships
// `http://fluxbase:8080` (a Docker-internal hostname used by the container),
// which isn't reachable when this script runs on the host. Remap the known
// container host to localhost so the script works without manual overrides.
const RAW_FLUXBASE_URL =
	process.env.FLUXBASE_PUBLIC_BASE_URL ||
	process.env.PUBLIC_FLUXBASE_URL ||
	'http://127.0.0.1:8080';
const FLUXBASE_URL = RAW_FLUXBASE_URL.replace('://fluxbase:', '://127.0.0.1:').replace(
	'://fluxbase-',
	'://127.0.0.1-'
);
const ANON_KEY = process.env.PUBLIC_FLUXBASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.FLUXBASE_SERVICE_ROLE_KEY || '';

const SEED_EMAIL = process.env.WAYLI_SEED_EMAIL || 'screenshots-demo@wayli.app';
const SEED_PASSWORD = process.env.WAYLI_SEED_PASSWORD || 'wayli-screenshots-demo!';
const SEED_USERNAME = (process.env.WAYLI_SEED_USERNAME || 'wayli-demo')
	.toLowerCase()
	.replace(/[^a-z0-9-]/g, '-');

if (!SERVICE_ROLE_KEY) {
	console.error('❌ FLUXBASE_SERVICE_ROLE_KEY is required in web/.env');
	process.exit(1);
}
if (!ANON_KEY) {
	console.error('❌ PUBLIC_FLUXBASE_ANON_KEY is required in web/.env');
	process.exit(1);
}

// ── Deterministic PRNG (mulberry32) so every run is identical ───────────────

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rng = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

// ── Clients ─────────────────────────────────────────────────────────────────

// Service-role client bypasses RLS for direct seeding inserts/deletes.
const admin = createClient(FLUXBASE_URL, SERVICE_ROLE_KEY, {
	auth: { autoRefresh: false, persist: false }
});

// Anon client for user signup (createUser via service-role admin instead).
const anon = createClient(FLUXBASE_URL, ANON_KEY, {
	auth: { autoRefresh: false, persist: false }
});

// ── Types ───────────────────────────────────────────────────────────────────

type Mode = 'walking' | 'cycling' | 'car' | 'train' | 'airplane' | 'stationary';

interface TrackPoint {
	lng: number;
	lat: number;
	t: Date;
	speed: number;
	mode: Mode;
}

// ── Synthetic GPS track generators ──────────────────────────────────────────

/**
 * Build a coherent path by interpolating between waypoints with small jitter,
 * assigning a transport mode per segment. Speeds are realistic per mode (m/s).
 */
function buildTrack(
	waypoints: Array<{ lng: number; lat: number; mode: Mode }>,
	start: Date,
	pointsPerSegment: number
): TrackPoint[] {
	const out: TrackPoint[] = [];
	const MODE_SPEED: Record<Mode, number> = {
		walking: 1.3,
		cycling: 4.5,
		car: 13,
		train: 28,
		airplane: 220,
		stationary: 0
	};
	let cursor = new Date(start);

	for (let s = 0; s < waypoints.length - 1; s++) {
		const a = waypoints[s];
		const b = waypoints[s + 1];
		const mode = b.mode;
		const baseSpeed = MODE_SPEED[mode];
		for (let i = 0; i < pointsPerSegment; i++) {
			const frac = i / pointsPerSegment;
			const lng = a.lng + (b.lng - a.lng) * frac + (rng() - 0.5) * 0.0008;
			const lat = a.lat + (b.lat - a.lat) * frac + (rng() - 0.5) * 0.0008;
			out.push({ lng, lat, t: new Date(cursor), speed: baseSpeed * (0.7 + rng() * 0.6), mode });
			// Step time by distance/speed approximation (~simple).
			cursor = new Date(cursor.getTime() + (mode === 'stationary' ? 120000 : 45000));
		}
	}
	return out;
}

/** Kyoto walking + train tour — varied modes for the Statistics segment colors. */
function kyotoTrack(start: Date): TrackPoint[] {
	return buildTrack(
		[
			{ lng: 135.7681, lat: 35.0116, mode: 'walking' }, // Kyoto Station
			{ lng: 135.7747, lat: 35.0137, mode: 'walking' }, // Higashi Hongan-ji
			{ lng: 135.7836, lat: 35.0174, mode: 'walking' }, // Gion
			{ lng: 135.7926, lat: 35.0236, mode: 'walking' }, // Yasaka Shrine
			{ lng: 135.7999, lat: 35.0278, mode: 'walking' }, // Ginkaku-ji
			{ lng: 135.7331, lat: 34.9851, mode: 'train' }, // Fushimi Inari
			{ lng: 135.6762, lat: 35.0394, mode: 'train' }, // Arashiyama
			{ lng: 135.6721, lat: 35.0095, mode: 'walking' } // Bamboo grove
		],
		start,
		16
	);
}

/** Lisbon driving + walking city tour. */
function lisbonTrack(start: Date): TrackPoint[] {
	return buildTrack(
		[
			{ lng: -9.1393, lat: 38.7223, mode: 'car' }, // Praça do Comércio
			{ lng: -9.1456, lat: 38.7258, mode: 'walking' }, // Alfama
			{ lng: -9.1602, lat: 38.7147, mode: 'walking' }, // Belém
			{ lng: -9.2055, lat: 38.6979, mode: 'car' } // Belém tower
		],
		start,
		18
	);
}

/** Berlin cycling commute. */
function berlinTrack(start: Date): TrackPoint[] {
	return buildTrack(
		[
			{ lng: 13.405, lat: 52.52, mode: 'cycling' }, // Brandenburg Gate
			{ lng: 13.4135, lat: 52.5219, mode: 'cycling' }, // Reichstag
			{ lng: 13.4238, lat: 52.5163, mode: 'cycling' }, // Museum Island
			{ lng: 13.3777, lat: 52.5163, mode: 'cycling' } // Potsdamer Platz
		],
		start,
		14
	);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const daysAgo = (n: number, hour = 10): Date => {
	const d = new Date();
	d.setUTCHours(hour, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - n);
	return d;
};

function wkt(lng: number, lat: number): string {
	return `POINT(${lng} ${lat})`;
}

async function exists<T>(p: Promise<{ data: T | null; error: unknown }>): Promise<T | null> {
	const { data, error } = await p;
	if (error) {
		console.warn('  query error:', (error as any)?.message ?? error);
		return null;
	}
	return data;
}

// ── Seeding steps ───────────────────────────────────────────────────────────

async function ensureUser(): Promise<{ id: string; email: string }> {
	console.log(`\n👤 Ensuring demo user ${SEED_EMAIL} ...`);

	// Detect an existing demo user by attempting a password sign-in. This is
	// more reliable than the admin listUsers() API, which needs admin-auth (the
	// service-role key alone isn't enough on the auth-admin surface).
	const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
		email: SEED_EMAIL,
		password: SEED_PASSWORD
	});
	if (!signInError && signInData?.user?.id) {
		const id = signInData.user.id;
		console.log(`  found existing user ${id}; deleting data for a clean reseed.`);
		await wipeUserData(id);
		return { id, email: SEED_EMAIL };
	}

	// Not present (or wrong password) — create via anon signUp. If signup is
	// disabled, the operator should pre-create the user and re-run.
	console.log('  not found — creating via signUp ...');
	const { data, error } = await anon.auth.signUp({ email: SEED_EMAIL, password: SEED_PASSWORD });
	if (error || !data?.user) {
		console.error(
			'❌ Could not create demo user. If signup is disabled, create it manually first\n' +
				'   (email: ' +
				SEED_EMAIL +
				', password: ' +
				SEED_PASSWORD +
				'), then re-run.\n   Error:',
			(error as any)?.message ?? error
		);
		process.exit(1);
	}
	console.log(`  created user ${data.user.id}`);
	return { id: data.user.id, email: SEED_EMAIL };
}

/** Delete all demo user-owned rows so re-runs are idempotent. */
async function wipeUserData(userId: string): Promise<void> {
	const tables = [
		'trip_plan_items',
		'trip_entries',
		'trip_likes',
		'trip_comments',
		'trip_collaborators',
		'trip_shares',
		'want_to_visit_places',
		'tracker_daily_activity',
		'tracker_data',
		'trips',
		'user_preferences'
	];
	for (const t of tables) {
		await exists(admin.from(t).delete().eq('user_id', userId) as any);
	}
}

async function seedProfile(userId: string): Promise<void> {
	console.log('📝 Seeding user_profiles ...');
	const homeAddress = {
		display_name: 'Quai des Belges, 13001 Marseille, France',
		name: 'Marseille Vieux-Port',
		geometry: { type: 'Point', coordinates: [5.3732, 43.2945] }
	};
	const { error } = await admin.from('user_profiles').upsert({
		id: userId,
		first_name: 'Alex',
		last_name: 'Traveler',
		full_name: 'Alex Traveler',
		username: SEED_USERNAME,
		role: 'user',
		onboarding_completed: true,
		onboarding_dismissed: true,
		home_address_skipped: false,
		first_login_at: new Date().toISOString(),
		discoverable: 'everyone',
		home_address: homeAddress,
		// Cover + avatar for a polished public-profile hero.
		cover_photo_url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1600&q=80',
		cover_focal_x: 0.5,
		cover_focal_y: 0.4,
		avatar_url: 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&q=80'
	});
	if (error) console.warn('  user_profiles upsert error:', (error as any)?.message);
}

async function seedPreferences(userId: string): Promise<void> {
	console.log('⚙️ Seeding user_preferences (dismiss onboarding checklist) ...');
	// Dismiss the "Get started with Wayli" onboarding checklist banner so it
	// never appears in screenshots. The banner shows while
	// onboarding_checklist.dismissed is false; setting it true suppresses it.
	const { error } = await admin.from('user_preferences').upsert({
		id: userId,
		theme: 'light',
		language: 'en',
		notifications_enabled: true,
		timezone: 'UTC+00:00 (London, Dublin)',
		trip_exclusions: [],
		preferences: {
			onboarding_checklist: {
				dismissed: true,
				dismissed_at: new Date().toISOString(),
				completed_steps: []
			}
		}
	});
	if (error) console.warn('  user_preferences upsert error:', (error as any)?.message);
}

interface SeedTrip {
	id: string;
	title: string;
	description: string;
	cover: string;
	country: string;
	countryCode: string;
	cities: string[];
	status: 'completed' | 'active' | 'planned';
	visibility: 'private' | 'public' | 'unlisted';
	startOffsetDays: number;
	durationDays: number;
	distanceKm: number;
}

// Royalty-free Unsplash cover photos (stable photo IDs, 1200px).
const COVER = {
	japan: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=80',
	portugal: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=1200&q=80',
	germany: 'https://images.unsplash.com/photo-1560969184-10f899910ea5?w=1200&q=80',
	iceland: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=1200&q=80',
	morocco: 'https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=1200&q=80',
	norway: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1200&q=80',
	italy: 'https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=1200&q=80'
};

const TRIPS: SeedTrip[] = [
	{
		id: 'a1b2c3d4-0001-4000-8000-000000000001',
		title: 'Spring in Kyoto',
		description:
			'A week wandering temples, tea houses, and the bamboo groves of Arashiyama at peak cherry-blossom season.',
		cover: COVER.japan,
		country: 'Japan',
		countryCode: 'JP',
		cities: ['Kyoto', 'Osaka'],
		status: 'completed',
		visibility: 'public',
		startOffsetDays: 120,
		durationDays: 7,
		distanceKm: 142
	},
	{
		id: 'a1b2c3d4-0001-4000-8000-000000000002',
		title: 'Lisbon Long Weekend',
		description:
			'Pasteis, miradouros, and a tram ride up to Alfama. Four days of sun-soaked hills.',
		cover: COVER.portugal,
		country: 'Portugal',
		countryCode: 'PT',
		cities: ['Lisbon', 'Sintra'],
		status: 'completed',
		visibility: 'public',
		startOffsetDays: 95,
		durationDays: 4,
		distanceKm: 88
	},
	{
		id: 'a1b2c3d4-0001-4000-8000-000000000003',
		title: 'Berlin Cycling Tour',
		description:
			'Three days carving through Berlin on two wheels — from the Brandenburg Gate to Tempelhof.',
		cover: COVER.germany,
		country: 'Germany',
		countryCode: 'DE',
		cities: ['Berlin'],
		status: 'completed',
		visibility: 'public',
		startOffsetDays: 60,
		durationDays: 3,
		distanceKm: 51
	},
	{
		id: 'a1b2c3d4-0001-4000-8000-000000000004',
		title: 'Moroccan Sahara',
		description:
			'Marrakech medina, the Atlas foothills, and a night under the stars in a Merzouga dune camp.',
		cover: COVER.morocco,
		country: 'Morocco',
		countryCode: 'MA',
		cities: ['Marrakech', 'Merzouga'],
		status: 'completed',
		visibility: 'public',
		startOffsetDays: 200,
		durationDays: 9,
		distanceKm: 674
	},
	{
		id: 'a1b2c3d4-0001-4000-8000-000000000005',
		title: 'Norwegian Fjords',
		description: 'Ferries, waterfalls, and impossibly steep cliffs from Bergen to Geiranger.',
		cover: COVER.norway,
		country: 'Norway',
		countryCode: 'NO',
		cities: ['Bergen', 'Geiranger'],
		status: 'completed',
		visibility: 'public',
		startOffsetDays: 300,
		durationDays: 6,
		distanceKm: 412
	},
	{
		id: 'a1b2c3d4-0001-4000-8000-000000000006',
		title: 'Puglia Coast',
		description: 'Whitewashed towns, olive groves, and the bluest water in Italy.',
		cover: COVER.italy,
		country: 'Italy',
		countryCode: 'IT',
		cities: ['Ostuni', 'Polignano a Mare'],
		status: 'completed',
		visibility: 'public',
		startOffsetDays: 380,
		durationDays: 5,
		distanceKm: 203
	},
	{
		id: 'a1b2c3d4-0001-4000-8000-000000000007',
		title: 'Iceland Ring Road',
		description: 'A planned ten-day loop — waterfalls, black sand beaches, and the highlands.',
		cover: COVER.iceland,
		country: 'Iceland',
		countryCode: 'IS',
		cities: ['Reykjavík', 'Vík'],
		status: 'planned',
		visibility: 'private',
		startOffsetDays: -45,
		durationDays: 10,
		distanceKm: 0
	}
];

async function seedTrips(userId: string): Promise<void> {
	console.log('🧳 Seeding trips ...');
	const rows = TRIPS.map((t) => {
		const start = daysAgo(t.startOffsetDays);
		const end = new Date(start);
		end.setUTCDate(end.getUTCDate() + t.durationDays);
		return {
			id: t.id,
			user_id: userId,
			title: t.title,
			description: t.description,
			start_date: start.toISOString().slice(0, 10),
			end_date: end.toISOString().slice(0, 10),
			status: t.status,
			visibility: t.visibility,
			image_url: t.cover,
			labels: [],
			// metadata drives the public-profile stats pills, the "Where I've
			// Been" world map, and the travel-page overview map.
			metadata: {
				dataPoints: Math.round(t.distanceKm * 6),
				visitedCities: t.cities,
				visitedCitiesDetailed: t.cities.map((city) => ({
					city,
					countryCode: t.countryCode
				})),
				visitedCountries: [t.country],
				visitedCountryCodes: [t.countryCode],
				primaryCity: t.cities[0],
				distanceTraveled: t.distanceKm * 1000
			}
		};
	});
	const { error } = await admin.from('trips').insert(rows);
	if (error) console.warn('  trips insert error:', (error as any)?.message);
	else console.log(`  inserted ${rows.length} trips`);
}

async function seedTrackerData(userId: string): Promise<void> {
	console.log('📍 Seeding tracker_data (GPS tracks) ...');
	const tracks: Array<{ tripId: string; points: TrackPoint[] }> = [
		{ tripId: TRIPS[0].id, points: kyotoTrack(daysAgo(118)) },
		{ tripId: TRIPS[1].id, points: lisbonTrack(daysAgo(58)) },
		{ tripId: TRIPS[2].id, points: berlinTrack(daysAgo(28)) }
	];

	let total = 0;
	let prev: TrackPoint | null = null;
	for (const { points } of tracks) {
		const records: any[] = [];
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			// Distance + time delta from previous point.
			const dist = prev && prev.mode === p.mode ? haversine(prev.lat, prev.lng, p.lat, p.lng) : 0;
			const timeSpent = prev ? Math.max(0, (p.t.getTime() - prev.t.getTime()) / 1000) : 0;
			records.push({
				user_id: userId,
				tracker_type: 'owntracks',
				device_id: 'screenshot-demo',
				location: wkt(p.lng, p.lat),
				recorded_at: p.t.toISOString(),
				speed: p.mode === 'stationary' ? 0 : p.speed,
				distance: dist,
				time_spent: timeSpent,
				transport_mode: p.mode,
				detection_reason: 'synthetic_seed',
				transport_mode_confidence: 0.9,
				transport_mode_manual: false,
				tz_diff: 0,
				created_at: new Date().toISOString()
			});
			prev = p;
		}
		// Insert in chunks to keep payloads reasonable.
		for (let i = 0; i < records.length; i += 200) {
			const batch = records.slice(i, i + 200);
			const { error } = await admin.from('tracker_data').insert(batch);
			if (error) console.warn('  tracker_data insert error:', (error as any)?.message);
		}
		total += records.length;
		prev = null;
	}
	console.log(`  inserted ~${total} tracker points`);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const WANT_TO_VISIT = [
	{
		title: 'Tsukiji Outer Market',
		type: 'restaurant',
		color: '#ef4444',
		rating: 5,
		lat: 35.6655,
		lng: 139.7707,
		fav: true
	},
	{
		title: 'Fushimi Inari Shrine',
		type: 'camera',
		color: '#f59e0b',
		rating: 5,
		lat: 34.9671,
		lng: 135.7723,
		fav: true
	},
	{
		title: 'Arashiyama Bamboo Grove',
		type: 'tree',
		color: '#10b981',
		rating: 4,
		lat: 35.0174,
		lng: 135.6716,
		fav: false
	},
	{
		title: 'Time Out Market Lisbon',
		type: 'restaurant',
		color: '#ef4444',
		rating: 4,
		lat: 38.7145,
		lng: -9.1457,
		fav: false
	},
	{
		title: 'Miradouro da Senhora do Monte',
		type: 'camera',
		color: '#f59e0b',
		rating: 5,
		lat: 38.7179,
		lng: -9.1326,
		fav: true
	},
	{
		title: 'Pastéis de Belém',
		type: 'coffee',
		color: '#a16207',
		rating: 5,
		lat: 38.6967,
		lng: -9.2031,
		fav: false
	},
	{
		title: 'Hotel Bairro Alto',
		type: 'hotel',
		color: '#3b82f6',
		rating: 4,
		lat: 38.7137,
		lng: -9.1446,
		fav: false
	},
	{
		title: 'Museum Island',
		type: 'building',
		color: '#8b5cf6',
		rating: 4,
		lat: 52.5163,
		lng: 13.4238,
		fav: false
	},
	{
		title: 'Brandenburg Gate',
		type: 'flag',
		color: '#0ea5e9',
		rating: 5,
		lat: 52.5163,
		lng: 13.3777,
		fav: false
	},
	{
		title: 'Tempelhof Field',
		type: 'tree',
		color: '#10b981',
		rating: 3,
		lat: 52.4713,
		lng: 13.4039,
		fav: false
	},
	{
		title: 'Mauerpark Flohmarkt',
		type: 'shopping',
		color: '#ec4899',
		rating: 4,
		lat: 52.5439,
		lng: 13.4023,
		fav: false
	},
	{
		title: 'East Side Gallery',
		type: 'camera',
		color: '#f59e0b',
		rating: 4,
		lat: 52.5051,
		lng: 13.4439,
		fav: false
	}
];

async function seedWantToVisit(userId: string): Promise<void> {
	console.log('⭐ Seeding want_to_visit_places ...');
	const rows = WANT_TO_VISIT.map((p) => ({
		user_id: userId,
		title: p.title,
		type: 'place',
		favorite: p.fav,
		location: wkt(p.lng, p.lat),
		address: `${p.title}`,
		marker_type: p.type,
		marker_color: p.color,
		rating: p.rating,
		labels: [p.type],
		created_at: new Date().toISOString()
	}));
	const { error } = await admin.from('want_to_visit_places').insert(rows);
	if (error) console.warn('  want_to_visit insert error:', (error as any)?.message);
	else console.log(`  inserted ${rows.length} places`);
}

async function seedJournal(userId: string): Promise<void> {
	console.log('📖 Seeding trip_entries (journal) ...');
	const kyoto = TRIPS[0];
	const lisbon = TRIPS[1];
	const morocco = TRIPS[3];
	const puglia = TRIPS[5];
	const start1 = daysAgo(117);
	const start2 = daysAgo(92);
	const start3 = daysAgo(197);
	const start4 = daysAgo(377);
	const rows = [
		{
			trip_id: kyoto.id,
			user_id: userId,
			title: 'First light at Fushimi Inari',
			body: 'We arrived at the base of Mount Inari before sunrise to beat the crowds. The **thousand vermillion torii gates** wind up the mountainside in tunnels of orange and shadow.\n\nBy the time we reached the mid-mountain shrine the city was waking below us. Worth every early alarm.',
			entry_date: start1.toISOString().slice(0, 10),
			status: 'published'
		},
		{
			trip_id: kyoto.id,
			user_id: userId,
			title: 'Arashiyama and the bamboo grove',
			body: 'The bamboo at Arashiyama towers overhead, swaying with a sound like distant water. We wandered through **Tenryū-ji** temple gardens afterward and took the slow train back along the river.',
			entry_date: new Date(start1.getTime() + 3 * 86400000).toISOString().slice(0, 10),
			status: 'published'
		},
		{
			trip_id: lisbon.id,
			user_id: userId,
			title: 'Miradouros at golden hour',
			body: 'Lisbon is a city built for viewpoints. We climbed up to **Miradouro da Senhora do Monte** as the sun dipped and the terracotta roofs turned to honey. A guitar player nearby, a glass of vinho verde in hand.',
			entry_date: start2.toISOString().slice(0, 10),
			status: 'published'
		},
		{
			trip_id: morocco.id,
			user_id: userId,
			title: 'A night in the Erg Chebbi dunes',
			body: 'We rode camels into the Sahara as the heat broke, the dunes of Merzouga turning gold then rose then violet. Our Berber guide sang quietly around the campfire and the stars overhead were the densest I have ever seen.',
			entry_date: start3.toISOString().slice(0, 10),
			status: 'published'
		},
		{
			trip_id: puglia.id,
			user_id: userId,
			title: 'Ostuni, the white city',
			body: 'Ostuni glows on its hilltop like a pile of chalk. We spent the morning lost in its alleys and the afternoon at a masseria lunch under centuries-old olive trees — some of the oldest in Italy.',
			entry_date: start4.toISOString().slice(0, 10),
			status: 'published'
		},
		{
			trip_id: lisbon.id,
			user_id: userId,
			title: 'Draft: pasteis notes',
			body: '_Still organising thoughts from Belém._',
			entry_date: daysAgo(90).toISOString().slice(0, 10),
			status: 'draft'
		}
	];
	const { error } = await admin.from('trip_entries').insert(rows);
	if (error) console.warn('  trip_entries insert error:', (error as any)?.message);
	else console.log(`  inserted ${rows.length} entries`);
}

async function seedTripPlan(userId: string): Promise<void> {
	console.log('🗂️ Seeding trip_plan_items ...');
	const kyoto = TRIPS[0];
	const day1 = daysAgo(117).toISOString().slice(0, 10);
	// Build a small itinerary for one day of the Kyoto trip.
	const items = [
		{
			day: 1,
			sort: 0,
			title: 'Breakfast at Inoda Coffee',
			type: 'food',
			time: '08:30',
			cost: 18,
			currency: 'EUR',
			lat: 35.0088,
			lng: 135.7688,
			status: 'booked'
		},
		{
			day: 1,
			sort: 1,
			title: 'Nishiki Market walk',
			type: 'sightseeing',
			time: '10:00',
			cost: 0,
			currency: 'EUR',
			lat: 35.005,
			lng: 135.7649,
			status: 'not_booked'
		},
		{
			day: 1,
			sort: 2,
			title: 'Lunch — Ramen Sen-no-Kaze',
			type: 'food',
			time: '12:30',
			cost: 14,
			currency: 'EUR',
			lat: 35.013,
			lng: 135.7781,
			status: 'not_booked'
		},
		{
			day: 1,
			sort: 3,
			title: 'Gion afternoon stroll',
			type: 'sightseeing',
			time: '14:30',
			cost: 0,
			currency: 'EUR',
			lat: 35.0036,
			lng: 135.7788,
			status: 'not_booked'
		},
		{
			day: 1,
			sort: 4,
			title: 'Kaiseki dinner',
			type: 'food',
			time: '19:00',
			cost: 85,
			currency: 'EUR',
			lat: 35.008,
			lng: 135.7747,
			status: 'booked'
		},
		{
			day: 1,
			sort: 5,
			title: 'Ryokan stay',
			type: 'accommodation',
			time: '22:00',
			cost: 140,
			currency: 'EUR',
			lat: 35.01,
			lng: 135.772,
			status: 'booked'
		}
	];
	const rows = items.map((it) => ({
		trip_id: kyoto.id,
		user_id: userId,
		day_number: it.day,
		sort_order: it.sort,
		title: it.title,
		type: it.type,
		start_time: it.time,
		cost_estimate: it.cost,
		currency: it.currency,
		booking_status: it.status,
		location_lat: it.lat,
		location_lng: it.lng,
		created_by: userId
	}));
	const { error } = await admin.from('trip_plan_items').insert(rows);
	if (error) console.warn('  trip_plan_items insert error:', (error as any)?.message);
	else console.log(`  inserted ${rows.length} plan items`);
}

async function refreshDailyActivity(userId: string): Promise<void> {
	console.log('🔁 Refreshing tracker_daily_activity cache ...');
	// The activity calendar reads from tracker_daily_activity, a cache populated
	// by the refresh-daily-activity job (which calls the refresh-daily-activity-sql
	// RPC). Mirror the Statistics page: submit the job as the demo user.
	const userClient = createClient(FLUXBASE_URL, ANON_KEY, {
		auth: { autoRefresh: false, persist: false }
	});
	const { error: signInError } = await userClient.auth.signInWithPassword({
		email: SEED_EMAIL,
		password: SEED_PASSWORD
	});
	if (signInError) {
		console.warn(
			'  ⚠️ could not sign in as demo user to run refresh job — the activity calendar\n' +
				'     may be empty until you open Statistics and click the manual refresh button.\n' +
				'     Error:',
			(signInError as any)?.message
		);
		return;
	}
	const { data, error } = await userClient.jobs.submit('refresh-daily-activity', {}, {
		namespace: 'wayli'
	} as any);
	if (error) {
		console.warn('  refresh job submit error:', (error as any)?.message);
		return;
	}
	const jobId = (data as any)?.job_id || (data as any)?.id;
	if (jobId) {
		// Poll for completion (best-effort; the job is fast).
		for (let i = 0; i < 20; i++) {
			const { data: status } = await userClient.jobs
				.get(jobId, { namespace: 'wayli' } as any)
				.catch(() => ({ data: null }));
			const s = (status as any)?.status;
			if (s === 'completed' || s === 'failed') break;
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
	console.log('  refresh job submitted.');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log('🌱 Wayli synthetic screenshot seeder');
	console.log(`   Fluxbase: ${FLUXBASE_URL}`);
	console.log(`   User:     ${SEED_EMAIL}`);

	const { id: userId } = await ensureUser();

	await seedProfile(userId);
	await seedPreferences(userId);
	await seedTrips(userId);
	await seedTrackerData(userId);
	await seedWantToVisit(userId);
	await seedJournal(userId);
	await seedTripPlan(userId);
	await refreshDailyActivity(userId);

	console.log('\n✅ Seed complete. Demo login:');
	console.log(`   email:    ${SEED_EMAIL}`);
	console.log(`   password: ${SEED_PASSWORD}`);
	console.log(`   username: ${SEED_USERNAME}`);
}

main().catch((err) => {
	console.error('\n💥 Seeder failed:');
	console.error(err);
	process.exit(1);
});
