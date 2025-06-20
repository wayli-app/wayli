<script lang="ts">
	import { ListTodo, Play, MapPin, Image, BarChart, Database } from 'lucide-svelte';

	interface Job {
		id: string;
		title: string;
		description: string;
		lastRun: string;
		status: 'Completed' | 'Idle' | 'Running' | 'Failed';
		icon: any;
	}

	const jobs: Job[] = [
		{
			id: '1',
			title: 'Reverse geocoding: full refresh',
			description: 'Comprehensive location data refresh for all points.',
			lastRun: '17/06/2025, 05:57:48',
			status: 'Completed',
			icon: MapPin
		},
		{
			id: '2',
			title: 'Reverse geocoding: missing points',
			description: 'Only points with missing location data are being processed.',
			lastRun: '16/06/2025, 06:57:48',
			status: 'Idle',
			icon: MapPin
		},
		{
			id: '3',
			title: 'Generate cover photos for trips',
			description: 'Automatically generates cover photos for trips that are missing them using AI.',
			lastRun: 'Never',
			status: 'Idle',
			icon: Image
		},
		{
			id: '4',
			title: 'Statistics',
			description: 'Calculates travel summary, graphs, and reports.',
			lastRun: 'Never',
			status: 'Idle',
			icon: BarChart
		},
		{
			id: '5',
			title: 'Photo import',
			description: 'Imports new photo data for location tagging.',
			lastRun: 'Never',
			status: 'Idle',
			icon: Database
		}
	];

	function getStatusColor(status: Job['status']) {
		switch (status) {
			case 'Completed':
				return 'bg-green-100 text-green-700';
			case 'Running':
				return 'bg-blue-100 text-blue-700';
			case 'Failed':
				return 'bg-red-100 text-red-700';
			default:
				return 'bg-gray-100 text-gray-700';
		}
	}

	function triggerJob(job: Job) {
		// TODO: Implement job triggering
		console.log('Triggering job:', job.title);
	}
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<ListTodo class="h-7 w-7 text-[rgb(37,140,244)]" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Jobs</h1>
		</div>
	</div>

	<!-- Jobs Grid -->
	<div class="grid gap-6 grid-cols-1 md:grid-cols-2">
		{#each jobs as job}
			<div class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-2">
						<svelte:component this={job.icon} class="h-5 w-5 text-gray-400" />
						<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{job.title}</h3>
					</div>
					<span class="rounded-full px-3 py-1 text-xs font-medium {getStatusColor(job.status)}">
						{job.status}
					</span>
				</div>
				<div class="mb-4">
					<p class="text-sm text-gray-600 dark:text-gray-300">{job.description}</p>
				</div>
				<div class="flex items-center justify-between">
					<div>
						<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Last run</div>
						<div class="text-sm text-gray-700 dark:text-gray-300">{job.lastRun}</div>
					</div>
					<button
						class="flex items-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 cursor-pointer"
						on:click={() => triggerJob(job)}
					>
						<Play class="h-4 w-4" />
						Trigger
					</button>
				</div>
			</div>
		{/each}
	</div>
</div>