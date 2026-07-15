<script lang="ts">
	type Props = {
		src: string;
		focalX?: number;
		focalY?: number;
		editable?: boolean;
		onFocalChange?: (x: number, y: number) => void;
		class?: string;
	};

	let {
		src,
		focalX = 0.5,
		focalY = 0.5,
		editable = false,
		onFocalChange,
		class: cls = 'h-40 w-full'
	}: Props = $props();

	let container: HTMLElement | null = $state(null);
	let imgEl: HTMLImageElement | null = $state(null);
	let isDragging = $state(false);
	let dragStart = { x: 0, y: 0, focalX: 0.5, focalY: 0.5 };
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function onPointerDown(e: PointerEvent) {
		if (!editable || !container) return;
		isDragging = true;
		dragStart = { x: e.clientX, y: e.clientY, focalX, focalY };
		container.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDragging || !container || !imgEl) return;
		const rect = container.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;

		// Account for object-cover overflow: the image is wider/taller than
		// the container, so dragging 1px moves less than 1/containerWidth of
		// the focal range. Compute the actual rendered image size.
		const img = imgEl;
		const scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
		const renderedW = img.naturalWidth * scale;
		const renderedH = img.naturalHeight * scale;

		// Normalize drag delta by the RENDERED image size, not container size
		const dx = (e.clientX - dragStart.x) / renderedW;
		const dy = (e.clientY - dragStart.y) / renderedH;
		focalX = Math.max(0, Math.min(1, dragStart.focalX - dx));
		focalY = Math.max(0, Math.min(1, dragStart.focalY - dy));
	}

	function onPointerUp() {
		if (!isDragging) return;
		isDragging = false;
		if (onFocalChange) {
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = setTimeout(() => onFocalChange(focalX, focalY), 400);
		}
	}
</script>

<div
	bind:this={container}
	class="relative overflow-hidden {cls}"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	role="presentation"
>
	<img
		bind:this={imgEl}
		{src}
		alt=""
		class="h-full w-full object-cover {editable ? 'cursor-grab' : ''} {isDragging
			? 'cursor-grabbing'
			: ''}"
		style="object-position: {focalX * 100}% {focalY * 100}%"
		draggable="false"
	/>
	{#if isDragging}
		<div class="pointer-events-none absolute inset-0 ring-2 ring-primary/40"></div>
	{/if}
</div>
