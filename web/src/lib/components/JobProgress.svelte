// web/src/lib/components/JobProgress.svelte
<script lang="ts">
	interface Props {
		progress: number;
		status?: string;
		jobId?: string;
	}

	const { progress, status = 'running', jobId = '' } = $props();

	// Debug state to track prop changes
	let debugInfo = $state({
		receivedProgress: progress,
		lastUpdate: new Date().toISOString()
	});

	// Update debug info when props change
	$effect(() => {
		debugInfo = {
			receivedProgress: progress,
			lastUpdate: new Date().toISOString()
		};
		console.log('🎯 JobProgress: Received progress:', progress);
	});
</script>

<div class="space-y-4">
	<!-- Progress Display -->
	<div class="flex items-center justify-between">
		<div class="text-sm font-medium text-gray-700 dark:text-gray-300">
			Progress: {status}
		</div>
		<div class="text-right">
			<div class="text-2xl font-bold text-green-600 dark:text-green-400">
				{progress}%
			</div>
		</div>
	</div>

	<!-- Progress Bar -->
	<div class="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
		<div
			class="h-3 rounded-full bg-green-600 transition-all duration-300 ease-out"
			style="width: {progress}%"
		></div>
	</div>

	<!-- Debug Info -->
	<div class="text-xs text-red-500 dark:text-red-400 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
		<div><strong>JobProgress Component Debug:</strong></div>
		<div>Job ID: {jobId}</div>
		<div>Received Progress: {debugInfo.receivedProgress}%</div>
		<div>Last Update: {debugInfo.lastUpdate}</div>
		<div>Status: {status}</div>
	</div>
</div>