					<div class="mb-4">
						<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Account Settings</h2>
						<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Manage your account settings and preferences.</p>
					</div>

					<div class="space-y-4">
						<div>
							<label for="name" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Name</label>
							<input
								type="text"
								id="name"
								bind:value={name}
								class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
							/>
						</div>
						<div>
							<label for="email" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Email</label>
							<input
								type="email"
								id="email"
								bind:value={email}
								class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
							/>
						</div>
						<div>
							<label for="currentPassword" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Current Password</label>
							<input
								type="password"
								id="currentPassword"
								bind:value={currentPassword}
								class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
							/>
						</div>
						<div>
							<label for="newPassword" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">New Password</label>
							<input
								type="password"
								id="newPassword"
								bind:value={newPassword}
								class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
							/>
						</div>
						<div>
							<label for="confirmPassword" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Confirm New Password</label>
							<input
								type="password"
								id="confirmPassword"
								bind:value={confirmPassword}
								class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
							/>
						</div>
						<div class="flex items-center gap-2">
							<input
								type="checkbox"
								id="emailNotifications"
								bind:checked={emailNotifications}
								class="h-4 w-4 rounded border-gray-300 dark:border-[#3f3f46] text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)] bg-white dark:bg-[#23232a]"
							/>
							<label for="emailNotifications" class="text-sm text-gray-900 dark:text-gray-100">Receive Email Notifications</label>
						</div>
					</div>

					<div class="mt-6 flex justify-end gap-3">
						<button
							class="rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2d2d35]"
							on:click={resetForm}
						>
							Reset
						</button>
						<button
							class="rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90"
							on:click={saveSettings}
						>
							Save Changes
						</button>
					</div>

<script lang="ts">
	let name = '';
	let email = '';
	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	let emailNotifications = false;

	function resetForm() {
		name = '';
		email = '';
		currentPassword = '';
		newPassword = '';
		confirmPassword = '';
		emailNotifications = false;
	}

	function saveSettings() {
		// TODO: Implement save settings logic
		console.log('Saving settings...');
	}
</script>