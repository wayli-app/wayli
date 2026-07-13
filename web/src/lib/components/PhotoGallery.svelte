<script lang="ts">
	import { onMount } from 'svelte';
	import { userStore } from '$lib/stores/auth';
	import { page } from '$app/state';
	import type { TripMedia } from '$lib/types/media.types';
	import {
		listMedia,
		createMedia,
		deleteMedia,
		uploadMedia
	} from '$lib/services/trip-media.service';
	import { compressImage } from '$lib/utils/image-compress';
	import { ImagePlus, Trash2, X, Loader2 } from 'lucide-svelte';

	type Props = {
		tripId: string;
		entryId?: string;
	};

	let { tripId, entryId }: Props = $props();

	let media = $state<TripMedia[]>([]);
	let isLoading = $state(true);
	let isUploading = $state(false);
	let lightbox = $state<TripMedia | null>(null);
	let fileInput: HTMLInputElement;

	const tripIdSafe = $derived(page.params.tripId ?? tripId);

	onMount(async () => {
		await loadMedia();
	});

	async function loadMedia() {
		isLoading = true;
		try {
			let all = await listMedia(tripIdSafe);
			if (entryId) {
				all = all.filter((m) => m.entry_id === entryId);
			}
			media = all;
		} catch (err) {
			console.error('Failed to load media:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		if (!$userStore?.id) return;

		isUploading = true;
		try {
			for (const file of Array.from(input.files)) {
				if (!file.type.startsWith('image/')) continue;

				// Compress client-side (max 2048px, quality 0.85 + 400px thumbnail)
				const { full, thumbnail } = await compressImage(file);

				// Upload both variants
				const timestamp = Date.now();
				const fullPath = await uploadMedia(
					$userStore.id,
					tripIdSafe,
					full.blob,
					`${timestamp}-${file.name}`
				);
				const thumbPath = await uploadMedia(
					$userStore.id,
					tripIdSafe,
					thumbnail.blob,
					`${timestamp}-thumb-${file.name}`
				);

				// Create metadata row
				const created = await createMedia({
					user_id: $userStore.id,
					trip_id: tripIdSafe,
					entry_id: entryId,
					storage_path: fullPath,
					thumbnail_path: thumbPath,
					width: full.width,
					height: full.height,
					taken_at: full.takenAt ?? undefined,
					exif: full.exif ?? undefined
				});
				media = [...media, created];
			}
		} catch (err) {
			console.error('Upload failed:', err);
		} finally {
			isUploading = false;
			input.value = ''; // reset for re-upload
		}
	}

	async function handleDelete(item: TripMedia) {
		if (!confirm('Delete this photo?')) return;
		try {
			await deleteMedia(item);
			media = media.filter((m) => m.id !== item.id);
			if (lightbox?.id === item.id) lightbox = null;
		} catch (err) {
			console.error('Delete failed:', err);
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') lightbox = null;
	}}
/>

<div>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		multiple
		class="hidden"
		onchange={handleFileSelect}
	/>

	{#if isLoading}
		<!-- silent: no flash -->
	{:else if media.length === 0}
		<button
			type="button"
			onclick={() => fileInput.click()}
			disabled={isUploading}
			class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
		>
			{#if isUploading}
				<Loader2 class="h-3 w-3 animate-spin" /> Uploading...
			{:else}
				<ImagePlus class="h-3 w-3" /> Add photos
			{/if}
		</button>
	{:else}
		<div class="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
			{#each media as item (item.id)}
				<div class="group relative aspect-square overflow-hidden rounded-md">
					<button
						type="button"
						onclick={() => (lightbox = item)}
						class="h-full w-full cursor-pointer"
						aria-label="View photo"
					>
						<img
							src={item.thumbnail_path ?? item.storage_path}
							alt={item.caption || 'Trip photo'}
							class="h-full w-full object-cover transition-transform group-hover:scale-105"
							loading="lazy"
						/>
					</button>
					<button
						type="button"
						onclick={() => handleDelete(item)}
						class="bg-destructive absolute top-1 right-1 rounded-full p-1 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
						aria-label="Delete photo"><Trash2 class="h-3 w-3" /></button
					>
				</div>
			{/each}
			<!-- Add tile -->
			<button
				type="button"
				onclick={() => fileInput.click()}
				disabled={isUploading}
				class="border-border text-muted-foreground hover:text-foreground hover:bg-muted flex aspect-square items-center justify-center rounded-md border border-dashed transition-colors disabled:opacity-50"
				aria-label="Add photos"
			>
				{#if isUploading}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<ImagePlus class="h-4 w-4" />
				{/if}
			</button>
		</div>
	{/if}
</div>

<!-- Lightbox -->
{#if lightbox}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
		onclick={() => (lightbox = null)}
		role="presentation"
	>
		<button
			type="button"
			class="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
			aria-label="Close"><X class="h-6 w-6" /></button
		>
		<img
			src={lightbox.storage_path}
			alt={lightbox.caption || 'Photo'}
			class="max-h-[85vh] max-w-full rounded-lg object-contain"
			role="presentation"
		/>
	</div>
{/if}
