<script lang="ts">
	export let align: 'start' | 'center' | 'end' = 'center';
	export let class_name = '';
</script>

<div
	class="absolute left-0 z-50 mt-2 min-w-[8rem] origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
	class:left-0={align === 'start'}
	class:left-1/2={align === 'center'}
	class:right-0={align === 'end'}
	class:-translate-x-1/2={align === 'center'}
	class={class_name}
>
	<slot />
</div>