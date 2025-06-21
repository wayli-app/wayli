<script lang="ts">
	export let align: 'start' | 'center' | 'end' = 'center';
	export let class_name = '';

	$: positionClass = align === 'start' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0';
</script>

<div
	class="absolute z-50 mt-2 min-w-[8rem] origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none {positionClass} {class_name}"
>
	<slot />
</div>