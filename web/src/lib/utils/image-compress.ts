/**
 * Client-side image compression utility.
 *
 * Resizes images via canvas to a max edge length and JPEG quality,
 * extracts EXIF data (GPS, timestamp, camera) via exifr.
 * No server-side processing needed for Phase 2.
 */

import exifr from 'exifr';

export interface CompressedImage {
	blob: Blob;
	width: number;
	height: number;
	exif: Record<string, unknown> | null;
	takenAt: string | null;
}

export interface CompressOptions {
	maxEdge?: number; // max width or height in px (default 2048)
	quality?: number; // JPEG quality 0–1 (default 0.85)
	maxThumbnailEdge?: number; // thumbnail size (default 400)
}

/**
 * Load a File into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};
		img.src = url;
	});
}

/**
 * Draw an image to a canvas at the target dimensions and export as JPEG blob.
 */
function canvasToBlob(
	img: HTMLImageElement,
	maxEdge: number,
	quality: number
): { blob: Promise<Blob>; width: number; height: number } {
	let { width, height } = img;

	// Downscale if the longest edge exceeds maxEdge
	if (width > maxEdge || height > maxEdge) {
		if (width >= height) {
			height = Math.round((height / width) * maxEdge);
			width = maxEdge;
		} else {
			width = Math.round((width / height) * maxEdge);
			height = maxEdge;
		}
	}

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(img, 0, 0, width, height);

	return {
		blob: new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality)),
		width,
		height
	};
}

/**
 * Compress an image File: resize to maxEdge, export as JPEG, extract EXIF.
 * Returns the compressed full-size image + a thumbnail.
 */
export async function compressImage(
	file: File,
	opts: CompressOptions = {}
): Promise<{ full: CompressedImage; thumbnail: CompressedImage }> {
	const { maxEdge = 2048, quality = 0.85, maxThumbnailEdge = 400 } = opts;

	const [img, exifData] = await Promise.all([
		loadImage(file),
		exifr.parse(file, { gps: true, tiff: true, exif: true }).catch(() => null)
	]);

	const fullResult = canvasToBlob(img, maxEdge, quality);
	const thumbResult = canvasToBlob(img, maxThumbnailEdge, quality);

	const [fullBlob, thumbBlob] = await Promise.all([fullResult.blob, thumbResult.blob]);

	const takenAt = (exifData as any)?.DateTimeOriginal
		? new Date((exifData as any).DateTimeOriginal).toISOString()
		: null;

	return {
		full: {
			blob: fullBlob,
			width: fullResult.width,
			height: fullResult.height,
			exif: exifData,
			takenAt
		},
		thumbnail: {
			blob: thumbBlob,
			width: thumbResult.width,
			height: thumbResult.height,
			exif: null,
			takenAt: null
		}
	};
}
