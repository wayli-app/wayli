<script lang="ts">
	import { Wifi, WifiOff } from 'lucide-svelte';
	import { translate } from '$lib/i18n';

	let t = $derived($translate);

	let {
		status = 'disconnected' as 'connecting' | 'connected' | 'disconnected' | 'error',
		compact = false
	} = $props();

	// Get status display information
	let statusInfo = $derived.by(() => {
		switch (status) {
			case 'connected':
				return {
					icon: Wifi,
					color: 'text-green-600 dark:text-green-400',
					bgColor: 'bg-green-50 dark:bg-green-900/20',
					label: t('realtime.connected'),
					pulse: false
				};
			case 'connecting':
				return {
					icon: Wifi,
					color: 'text-yellow-600 dark:text-yellow-400',
					bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
					label: t('realtime.connecting'),
					pulse: true
				};
			case 'error':
				return {
					icon: WifiOff,
					color: 'text-red-600 dark:text-red-400',
					bgColor: 'bg-red-50 dark:bg-red-900/20',
					label: t('realtime.error'),
					pulse: false
				};
			default:
				return {
					icon: WifiOff,
					color: 'text-gray-400 dark:text-gray-500',
					bgColor: 'bg-gray-50 dark:bg-gray-900/20',
					label: t('realtime.disconnected'),
					pulse: false
				};
		}
	});
</script>

{#if compact}
	{@const Icon = statusInfo.icon}
	<!-- Compact mode - just an icon with tooltip -->
	<div
		class="flex items-center gap-1 rounded-full px-2 py-1 {statusInfo.bgColor}"
		title={statusInfo.label}
	>
		<Icon class="h-3 w-3 {statusInfo.color} {statusInfo.pulse ? 'animate-pulse' : ''}" />
	</div>
{:else}
	{@const Icon = statusInfo.icon}
	<!-- Full mode - icon and label -->
	<div class="flex items-center gap-2 rounded-lg px-3 py-1.5 {statusInfo.bgColor}">
		<Icon class="h-4 w-4 {statusInfo.color} {statusInfo.pulse ? 'animate-pulse' : ''}" />
		<span class="text-xs font-medium {statusInfo.color}">
			{statusInfo.label}
		</span>
	</div>
{/if}
