<script lang="ts">
	import { Import, FileDown, Database, Image, FileText } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	let importFormat = 'JSON';
	let exportFormat = 'JSON';
	let dateRange = 'All Time';
	let selectedFile: FileList | null = null;
	let includeLocationData = true;
	let includeTripInfo = true;
	let includeStatistics = false;

	const formats = ['JSON', 'CSV', 'GPX/KML'];
	const dateRanges = ['All Time', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Last year', 'Custom range'];

	async function handleImport() {
		if (!selectedFile?.length) {
			toast.error('Please select a file to import');
			return;
		}

		toast.promise(
			new Promise((resolve) => setTimeout(resolve, 2000)),
			{
				loading: 'Importing data...',
				success: 'Data imported successfully',
				error: 'Failed to import data'
			}
		);
	}

	async function handleExport() {
		toast.promise(
			new Promise((resolve) => setTimeout(resolve, 2000)),
			{
				loading: 'Exporting data...',
				success: 'Data exported successfully',
				error: 'Failed to export data'
			}
		);
	}

	async function handleQuickAction(action: string) {
		toast.promise(
			new Promise((resolve) => setTimeout(resolve, 2000)),
			{
				loading: `${action} in progress...`,
				success: `${action} completed successfully`,
				error: `Failed to ${action.toLowerCase()}`
			}
		);
	}
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<Import class="h-7 w-7 text-blue-600" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Import/Export</h1>
		</div>
	</div>

	<div class="grid gap-8 md:grid-cols-2">
		<!-- Import Section -->
		<div class="rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 flex flex-col">
			<div class="mb-6 flex items-center gap-3">
				<FileDown class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Import Data</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600 dark:text-gray-300">Import your travel data from various sources</p>

			<div class="flex-1 space-y-4">
				<div>
					<label for="importFormat" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Import Format</label>
					<select
						id="importFormat"
						bind:value={importFormat}
						class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						{#each formats as format}
							<option value={format}>{format}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="fileInput" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Select File</label>
					<div class="relative">
						<input
							type="file"
							id="fileInput"
							bind:files={selectedFile}
							class="block w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:border-0 file:bg-blue-50 dark:file:bg-blue-900/40 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-600 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/60"
						/>
					</div>
				</div>

				<div class="mt-6">
					<h3 class="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">Supported Sources</h3>
					<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
						<li>• Google Photos/Maps (via Takeout)</li>
						<li>• Immich photo management</li>
						<li>• GPX/KML track files</li>
						<li>• CSV location data</li>
						<li>• JSON exports from other apps</li>
					</ul>
				</div>
			</div>

			<button
				on:click={handleImport}
				class="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>
				<Import class="h-4 w-4" />
				Import Data
			</button>
		</div>

		<!-- Export Section -->
		<div class="rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 flex flex-col">
			<div class="mb-6 flex items-center gap-3">
				<FileDown class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Export Data</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600 dark:text-gray-300">Export your travel data to various formats</p>

			<div class="flex-1 space-y-4">
				<div>
					<label for="exportFormat" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Export Format</label>
					<select
						id="exportFormat"
						bind:value={exportFormat}
						class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						{#each formats as format}
							<option value={format}>{format}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="dateRange" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Date Range</label>
					<select
						id="dateRange"
						bind:value={dateRange}
						class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						{#each dateRanges as range}
							<option value={range}>{range}</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100" for="includeLocationData">Include</label>
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeLocationData}
								class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Location data</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeTripInfo}
								class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Trip information</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeStatistics}
								class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Statistics</span>
						</label>
					</div>
				</div>
			</div>

			<button
				on:click={handleExport}
				class="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>
				<FileDown class="h-4 w-4" />
				Export Data
			</button>
		</div>
	</div>
</div>