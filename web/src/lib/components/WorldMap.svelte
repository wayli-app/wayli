<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { watchMapTheme, TILE_URLS_NOLABELS } from '$lib/utils/map-theme';
	import { feature } from 'topojson-client';
	import type { Topology } from 'topojson-specification';

	type Props = {
		visitedCountries: string[];
		countryStats?: Record<string, { trips: number; cities: number }>;
		class?: string;
	};

	let { visitedCountries, countryStats = {}, class: className = 'h-80' }: Props = $props();

	let mapContainer: HTMLDivElement;
	let map: any = null;
	let L: any = null;
	let cleanupThemeWatcher: (() => void) | null = null;

	// world-atlas uses ISO 3166-1 numeric codes as feature IDs
	// Map ISO2 alpha codes → numeric codes
	const ISO2_TO_NUMERIC: Record<string, string> = {
		AD: '020',
		AE: '784',
		AF: '004',
		AG: '028',
		AL: '008',
		AM: '051',
		AO: '024',
		AR: '032',
		AT: '040',
		AU: '036',
		AZ: '031',
		BA: '070',
		BB: '052',
		BD: '050',
		BE: '056',
		BF: '854',
		BG: '100',
		BH: '048',
		BI: '108',
		BJ: '204',
		BN: '096',
		BO: '068',
		BR: '076',
		BS: '044',
		BT: '064',
		BW: '072',
		BY: '112',
		BZ: '084',
		CA: '124',
		CD: '180',
		CF: '140',
		CG: '178',
		CH: '756',
		CI: '384',
		CL: '152',
		CM: '120',
		CN: '156',
		CO: '170',
		CR: '188',
		CU: '192',
		CY: '196',
		CZ: '203',
		DE: '276',
		DJ: '262',
		DK: '208',
		DO: '214',
		DZ: '012',
		EC: '218',
		EE: '233',
		EG: '818',
		ER: '232',
		ES: '724',
		ET: '231',
		FI: '246',
		FJ: '242',
		FR: '250',
		GA: '266',
		GB: '826',
		GE: '268',
		GH: '288',
		GM: '270',
		GN: '324',
		GQ: '226',
		GR: '300',
		GT: '320',
		GW: '624',
		GY: '328',
		HK: '344',
		HN: '340',
		HR: '191',
		HT: '332',
		HU: '348',
		ID: '360',
		IE: '372',
		IL: '376',
		IN: '356',
		IQ: '368',
		IR: '364',
		IS: '352',
		IT: '380',
		JM: '388',
		JO: '400',
		JP: '392',
		KE: '404',
		KG: '417',
		KH: '116',
		KP: '408',
		KR: '410',
		KW: '414',
		KZ: '398',
		LA: '418',
		LB: '422',
		LK: '144',
		LR: '430',
		LS: '426',
		LT: '440',
		LU: '442',
		LV: '428',
		LY: '434',
		MA: '504',
		MD: '498',
		ME: '499',
		MG: '450',
		MK: '807',
		ML: '466',
		MM: '104',
		MN: '496',
		MR: '478',
		MT: '470',
		MV: '462',
		MW: '454',
		MX: '484',
		MY: '458',
		MZ: '508',
		NA: '516',
		NE: '562',
		NG: '566',
		NI: '558',
		NL: '528',
		NO: '578',
		NP: '524',
		NZ: '554',
		OM: '512',
		PA: '591',
		PE: '604',
		PG: '598',
		PH: '608',
		PK: '586',
		PL: '616',
		PR: '630',
		PT: '620',
		PY: '600',
		QA: '634',
		RO: '642',
		RS: '688',
		RU: '643',
		RW: '646',
		SA: '682',
		SB: '090',
		SD: '729',
		SE: '752',
		SG: '702',
		SI: '705',
		SK: '703',
		SL: '694',
		SN: '686',
		SO: '706',
		SR: '740',
		SV: '222',
		SY: '760',
		SZ: '748',
		TD: '148',
		TG: '768',
		TH: '764',
		TJ: '762',
		TL: '626',
		TM: '795',
		TN: '788',
		TR: '792',
		TT: '780',
		TW: '158',
		TZ: '834',
		UA: '804',
		UG: '800',
		US: '840',
		UY: '858',
		UZ: '860',
		VE: '862',
		VN: '704',
		YE: '887',
		ZA: '710',
		ZM: '894',
		ZW: '716'
	};

	const visitedNumeric = $derived(
		new Set(visitedCountries.map((c) => ISO2_TO_NUMERIC[c.toUpperCase()]).filter(Boolean))
	);

	onMount(async () => {
		L = (await import('leaflet')).default;

		map = L.map(mapContainer, {
			scrollWheelZoom: true,
			zoomControl: false,
			// Let the world repeat horizontally when panned (preferred look).
			// No maxBounds: clamping would suppress the repetition.
			worldCopyJump: false
		});
		cleanupThemeWatcher = watchMapTheme(map, (theme) =>
			// No-labels tiles: the `_all` CartoDB tiles bake cartographic
			// graticule (latitude/longitude rules) into the raster at these low
			// zooms, showing up as unwanted thin horizontal lines across the
			// whole viewport. Country borders come from the GeoJSON overlay
			// below, so we use the label-free variant here.
			L.tileLayer(TILE_URLS_NOLABELS[theme].url, {
				attribution: TILE_URLS_NOLABELS[theme].attribution,
				maxZoom: 5
			})
		);

		try {
			const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
			const topoData: Topology = await resp.json();

			// Single merged landmass polygon (objects.land). Drawing the gray
			// "unvisited" tint as ONE shape eliminates the SVG polygon-tiling
			// seams that appeared as thin horizontal gray lines across the map:
			// per-country fills at partial opacity anti-alias independently at
			// every shared interior border, and those per-edge seams line up
			// into visible lines across continents. One polygon = no interior
			// edges = no seams.
			if (topoData.objects.land) {
				const landGeo = feature(topoData, topoData.objects.land as any);
				L.geoJSON(landGeo as any, {
					style: () => ({
						fillColor: '#e5e7eb',
						weight: 0,
						opacity: 0,
						color: '#d1d5db',
						fillOpacity: 0.3
					})
				}).addTo(map);
			}

			// Overlay ONLY visited countries on top. Unvisited countries are no
			// longer drawn individually (the land polygon above carries their
			// tint), which removes ~180 individual fills and their seams.
			const geojson = feature(topoData, topoData.objects.countries as any);
			L.geoJSON(geojson as any, {
				style: (f: any) => {
					const numId = String(f.id || '').padStart(3, '0');
					const isVisited = visitedNumeric.has(numId);
					if (isVisited) {
						return {
							fillColor: '#3b82f6',
							weight: 1,
							opacity: 1,
							color: '#1d4ed8',
							fillOpacity: 0.7
						};
					}
					// Unvisited: render nothing — the merged land layer already
					// provides the gray tint. (fill/stroke false.)
					return { fill: false, stroke: false };
				},
				onEachFeature: (f: any, layer: any) => {
					const numId = String(f.id || '').padStart(3, '0');
					const name = f.properties?.name || 'Unknown';
					const isVisited = visitedNumeric.has(numId);
					if (isVisited) {
						layer.bindTooltip(
							`${name}<br><span style="font-size:11px;color:#3b82f6">Visited</span>`,
							{ sticky: true }
						);
					}
				}
			}).addTo(map);
		} catch (err) {
			console.error('Failed to load world map data:', err);
		}

		map.setView([20, 0], 2);
		setTimeout(() => map?.invalidateSize(), 200);
	});

	onDestroy(() => {
		cleanupThemeWatcher?.();
		map?.remove();
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div bind:this={mapContainer} class="relative z-0 rounded-lg {className}"></div>

<style>
	/* Tiles only cover roughly ±85° latitude and the zoom-2 tile grid doesn't
	   align to this small container, so a partial tile row sits at the top and
	   bottom edges. Previously this used `background: transparent` to "blend the
	   gap" into the surrounding card/page background — but that exposed the
	   partial tiles' anti-aliased edge against a contrasting background, which
	   rendered as a thin full-width horizontal gray line (the reported artifact).

	   Fix: give the container an opaque background that matches the CartoDB
	   basemap's own base color. Partial tile edges now composite into the
	   container instead of standing out against the page, eliminating the seam
	   (compositing, not covering). Values sampled from the *_nolabels tiles. */
	:global(.leaflet-container) {
		background: #d5dbdd;
	}
	:global(.dark .leaflet-container) {
		background: #0a0a0b;
	}
</style>
