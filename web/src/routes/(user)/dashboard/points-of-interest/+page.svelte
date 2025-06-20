<script lang="ts">
import { onMount } from 'svelte';
import { Star, StarOff, Search, Calendar, MapPin, ChevronDown, Heart } from 'lucide-svelte';
import type { Map as LeafletMap, LatLngExpression } from 'leaflet';
import { format } from 'date-fns';

let map: LeafletMap;
let L: typeof import('leaflet');
let mapContainer: HTMLDivElement;
let currentTileLayer: any;
let searchQuery = '';
let selectedType = 'All';
let showFavoritesOnly = false;
let markers: any[] = [];
const types = ['All', 'Restaurants', 'Hotels', 'Shops', 'Museums', 'Parks', 'Bars', 'Landmarks', 'Cafés'];
let startDate: Date | null = null;
let endDate: Date | null = null;
let isDatePickerOpen = false;

interface POI {
  id: string;
  name: string;
  type: string;
  city: string;
  lastVisited: string;
  totalVisits: number;
  rating: number;
  favorite?: boolean;
  muted?: boolean;
}

const pois: POI[] = [
  {
    id: '1',
    name: 'Cafe Sunrise',
    type: 'restaurant',
    city: 'Paris',
    lastVisited: 'June 17th, 2025',
    totalVisits: 2,
    rating: 4,
    favorite: true
  },
  {
    id: '2',
    name: 'Blue Hotel',
    type: 'hotel',
    city: 'New York',
    lastVisited: 'June 17th, 2025',
    totalVisits: 1,
    rating: 1,
    muted: true
  },
  {
    id: '3',
    name: "Mom's Market",
    type: 'shop',
    city: 'London',
    lastVisited: 'Never',
    totalVisits: 0,
    rating: 0,
    muted: true
  },
  {
    id: '4',
    name: 'Downtown Pizza',
    type: 'restaurant',
    city: 'Tokyo',
    lastVisited: 'June 17th, 2025',
    totalVisits: 1,
    rating: 5
  }
];

$: filteredPOIs = pois.filter(poi =>
  (selectedType === 'All' || poi.type.toLowerCase() === selectedType.toLowerCase()) &&
  poi.name.toLowerCase().includes(searchQuery.toLowerCase())
);

function handlePlaceHover(place: POI) {
  if (!map) return;
  const [lat, lng] = place.city.split(',').map(Number);
  map.setView([lat, lng], 15);
}

function handlePlaceLeave() {
  if (!map) return;
  const bounds = L.latLngBounds(pois.map(p => {
    const [lat, lng] = p.city.split(',').map(Number);
    return [lat, lng];
  }));
  map.fitBounds(bounds, { padding: [50, 50] });
}

function toggleFavorite(place: POI) {
  place.favorite = !place.favorite;
  updateMarkers();
}

function updateMarkers() {
  if (!map) return;
  markers.forEach(marker => marker.remove());
  markers = filteredPOIs.map(place => {
    const [lat, lng] = place.city.split(',').map(Number);
    return L.marker([lat, lng])
      .bindPopup(place.name)
      .addTo(map);
  });
}

onMount(async () => {
  L = (await import('leaflet')).default;
  if (map) return;
  map = L.map(mapContainer, {
    zoomControl: true,
    attributionControl: false
  });

  function getTileLayerUrl() {
    const isDark = document.documentElement.classList.contains('dark');
    return isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  function getAttribution() {
    const isDark = document.documentElement.classList.contains('dark');
    return isDark
      ? '&copy; <a href="https://carto.com/attributions">CARTO</a>'
      : '© OpenStreetMap contributors';
  }

  L.tileLayer(getTileLayerUrl(), {
    attribution: getAttribution()
  }).addTo(map);
  map.setView([35.6895, 139.6917], 13); // Center on Tokyo for demo
  L.marker([35.6895, 139.6917]).addTo(map);
  updateMarkers();

  // Fit map to show all markers
  const bounds = L.latLngBounds(pois.map(p => {
    const [lat, lng] = p.city.split(',').map(Number);
    return [lat, lng];
  }));
  map.fitBounds(bounds, { padding: [50, 50] });

  // Listen for theme changes
  const observer = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains('dark');
    const newUrl = getTileLayerUrl();
    const newAttribution = getAttribution();
    if (currentTileLayer && currentTileLayer._url !== newUrl) {
      map.removeLayer(currentTileLayer);
      currentTileLayer = L.tileLayer(newUrl, { attribution: newAttribution }).addTo(map);
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

function selectType(type: string) {
  selectedType = type;
}
</script>

<svelte:head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
</svelte:head>

<div>
  <!-- Header -->
  <div class="mb-8 flex items-center gap-3">
    <Star class="h-7 w-7 text-[rgb(37,140,244)]" />
    <h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Points of Interest</h1>
  </div>

  <!-- Map -->
  <div class="mb-8 overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a]">
    <div
      bind:this={mapContainer}
      class="relative h-[400px] w-full"
      style="z-index: 10;"
    ></div>
  </div>

  <!-- Filters and Search -->
  <div class="mb-6 flex flex-wrap items-center gap-2">
    {#each types as type}
      <button
        class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {selectedType === type ? 'bg-[rgb(37,140,244)] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
        on:click={() => selectType(type)}
      >
        {type}
      </button>
    {/each}
    <button
      class="flex items-center gap-2 rounded-md border border-[rgb(218,218,221)] bg-white px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer h-[38px]"
      on:click={() => isDatePickerOpen = !isDatePickerOpen}
      type="button"
      tabindex="0"
      aria-haspopup="dialog"
      aria-expanded={isDatePickerOpen}
    >
      <Calendar class="h-4 w-4" />
      Date range
    </button>
    <div class="relative ml-auto w-64">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search..."
        class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 pl-10 pr-4 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
      />
    </div>
  </div>

  <!-- Date Range Picker -->
  {#if isDatePickerOpen}
    <div class="mb-6 rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-4">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label for="startDate" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Start Date</label>
          <input
            type="date"
            id="startDate"
            bind:value={startDate}
            class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
          />
        </div>
        <div>
          <label for="endDate" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">End Date</label>
          <input
            type="date"
            id="endDate"
            bind:value={endDate}
            class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
          />
        </div>
      </div>
    </div>
  {/if}

  <!-- POI Cards -->
  <div class="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
    {#each filteredPOIs as poi}
      <div
        class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
        on:mouseenter={() => handlePlaceHover(poi)}
        on:mouseleave={handlePlaceLeave}
        role="button"
        tabindex="0"
        aria-label="Point of interest {poi.name}"
      >
        <div class="flex items-center gap-2 mb-1">
          <span class="text-lg font-bold text-gray-900 dark:text-gray-100">{poi.name}</span>
          {#if poi.favorite}
            <Star class="h-4 w-4 text-yellow-400" />
          {/if}
          {#if poi.muted}
            <StarOff class="h-4 w-4 text-gray-400" />
          {/if}
          <span class="ml-auto text-xs uppercase text-gray-400 dark:text-gray-500">{poi.type}</span>
        </div>
        <div class="flex justify-between text-sm text-gray-700 dark:text-gray-300">
          <div>
            <div class="text-xs text-gray-400 dark:text-gray-500">City</div>
            <div>{poi.city}</div>
          </div>
          <div>
            <div class="text-xs text-gray-400 dark:text-gray-500">Last visited</div>
            <div>{poi.lastVisited}</div>
          </div>
          <div>
            <div class="text-xs text-gray-400 dark:text-gray-500">Total visits</div>
            <div>{poi.totalVisits}</div>
          </div>
        </div>
        <div class="flex items-center gap-1 mt-2">
          <div class="text-xs text-gray-400">Rating</div>
          {#each Array(5) as _, i}
            {#if i < poi.rating}
              <Star class="h-4 w-4 text-yellow-400" />
            {:else}
              <Star class="h-4 w-4 text-gray-200" />
            {/if}
          {/each}
        </div>
        <button
          class="ml-2 flex-shrink-0 text-gray-400 hover:text-gray-600"
          on:click={() => toggleFavorite(poi)}
        >
          <Heart class="h-5 w-5 {poi.favorite ? 'fill-red-500 text-red-500' : ''}" />
        </button>
      </div>
    {/each}
  </div>
</div>