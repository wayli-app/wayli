<script lang="ts">
	import { Settings, User as UserIcon, Lock, UserPlus, Server, Database, Search, Edit, Trash2, ChevronLeft, ChevronRight, Users } from 'lucide-svelte';
	import type { PageData } from './$types';
	import UserEditModal from '$lib/components/UserEditModal.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import WorkerManager from '$lib/components/admin/WorkerManager.svelte';

	export let data: PageData;

	// Define types
	type User = {
		id: string;
		email?: string;
		full_name?: string;
		avatar_url?: string;
		is_admin: boolean;
		created_at: string;
		user_metadata: {
			role?: 'admin' | 'user';
			[key: string]: any;
		};
		[key: string]: any;
	};

	type Integration = {
		id: string;
		title: string;
		description: string;
		icon: any;
		fields: Array<{
			id: string;
			label: string;
			type: 'text' | 'select' | 'checkbox';
			placeholder?: string;
			value: string | boolean;
			options?: Array<{ value: string; label: string }>;
			description?: string;
			help?: string;
		}>;
	};

	// Initialize users from server data
	$: users = data.users || [];
	let searchQuery = $page.url.searchParams.get('search') || '';
	let debouncedSearchQuery = searchQuery;
	let currentPage = data.pagination?.page || 1;
	let itemsPerPage = data.pagination?.limit || 10;
	let registrationEnabled = true;
	let oauthEnabled = false;
	let serverName = '';
	let adminEmail = '';
	let maxUsers = 0;
	let storageLimit = 0;
	let allowRegistration = false;
	let requireEmailVerification = false;
	let showAddUserModal = false;
	let isModalOpen = false;
	let selectedUser: User | null = null;
	let showDeleteConfirm = false;
	let userToDelete: User | null = null;
	let searchTimeout: ReturnType<typeof setTimeout>;
	let activeTab = 'users'; // Add tab state

	// Get pagination data from server
	$: pagination = data.pagination || {
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
		hasNext: false,
		hasPrev: false
	};

	// Debounced search update - only trigger when user changes the input
	function handleSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
			if (searchQuery !== debouncedSearchQuery) {
				console.log('Client - Search query changed:', searchQuery);
				debouncedSearchQuery = searchQuery;
				currentPage = 1; // Reset to first page when search changes
				await fetchFilteredUsers();
			}
		}, 300);
	}

	async function fetchFilteredUsers() {
		if (!browser) return;

		const params = new URLSearchParams();
		if (debouncedSearchQuery) params.set('search', debouncedSearchQuery);
		if (currentPage > 1) params.set('page', currentPage.toString());
		if (itemsPerPage !== 10) params.set('limit', itemsPerPage.toString());

		try {
			const response = await fetch(`/api/v1/admin/users?${params.toString()}`);
			if (response.ok) {
				const result = await response.json();
				users = result.users || [];
				pagination = result.pagination || {
					page: 1,
					limit: 10,
					total: 0,
					totalPages: 0,
					hasNext: false,
					hasPrev: false
				};
			} else {
				console.error('Error response:', response.status, response.statusText);
			}
		} catch (error) {
			console.error('Error fetching filtered users:', error);
		}
	}

	async function goToPage(page: number) {
		if (!browser) return;
		if (page >= 1 && page <= pagination.totalPages) {
			currentPage = page;
			await fetchFilteredUsers();
		}
	}

	async function goToPreviousPage() {
		if (!browser) return;
		if (pagination.hasPrev) {
			currentPage--;
			await fetchFilteredUsers();
		}
	}

	async function goToNextPage() {
		if (!browser) return;
		if (pagination.hasNext) {
			currentPage++;
			await fetchFilteredUsers();
		}
	}

	async function handleItemsPerPageChange() {
		if (!browser) return;
		currentPage = 1; // Reset to first page when changing items per page
		await fetchFilteredUsers();
	}

	function formatDate(dateString: string | null) {
		if (!dateString) return 'Never';
		return new Date(dateString).toLocaleDateString();
	}

	function getUserDisplayName(user: User) {
		return user.full_name || user.email?.split('@')[0] || 'Unknown User';
	}

	function getUserAvatar(user: User) {
		return user.avatar_url;
	}

	function handleAddUser(event: CustomEvent) {
		// ... existing code ...
	}

	const integrations: Integration[] = [
		{
			id: 'oauth',
			title: 'OAuth Provider',
			description: 'Configure OAuth provider settings for user authentication',
			icon: Database,
			fields: [
				{
					id: 'clientId',
					label: 'Client ID',
					type: 'text',
					placeholder: 'Enter your OAuth client ID',
					value: ''
				},
				{
					id: 'clientSecret',
					label: 'Client Secret',
					type: 'text',
					placeholder: 'Enter your OAuth client secret',
					value: ''
				},
				{
					id: 'authorizationUrl',
					label: 'Authorization URL',
					type: 'text',
					placeholder: 'https://example.com/oauth/authorize',
					value: ''
				},
				{
					id: 'tokenUrl',
					label: 'Token URL',
					type: 'text',
					placeholder: 'https://example.com/oauth/token',
					value: ''
				},
				{
					id: 'userInfoUrl',
					label: 'User Info URL',
					type: 'text',
					placeholder: 'https://example.com/oauth/userinfo',
					value: ''
				},
				{
					id: 'scopes',
					label: 'Scopes',
					type: 'text',
					placeholder: 'email profile openid',
					value: ''
				}
			]
		}
	];

	function handleUpdateServerName() {
		// TODO: Implement server name update
	}

	function resetForm() {
		serverName = '';
		adminEmail = '';
		maxUsers = 0;
		storageLimit = 0;
		allowRegistration = false;
		requireEmailVerification = false;
	}

	function saveSettings() {
		// TODO: Implement save settings
		console.log('Saving settings...');
	}

	function handleEditUser(user: User) {
		selectedUser = user;
		isModalOpen = true;
	}

	function handleModalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleCloseDeleteConfirm();
		}
	}

	function getPageNumbers() {
		const pages = [];
		const maxVisiblePages = 5;

		if (pagination.totalPages <= maxVisiblePages) {
			// Show all pages if total is small
			for (let i = 1; i <= pagination.totalPages; i++) {
				pages.push(i);
			}
		} else {
			// Show pages around current page
			let start = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
			let end = Math.min(pagination.totalPages, start + maxVisiblePages - 1);

			// Adjust start if we're near the end
			if (end === pagination.totalPages) {
				start = Math.max(1, end - maxVisiblePages + 1);
			}

			for (let i = start; i <= end; i++) {
				pages.push(i);
			}
		}

		return pages;
	}

	function handleDeleteUser(user: User) {
		userToDelete = user;
		showDeleteConfirm = true;
	}

	function handleCloseModal() {
		isModalOpen = false;
		selectedUser = null;
	}

	function handleCloseDeleteConfirm(e?: MouseEvent) {
		if (e && e.currentTarget !== e.target) return;
		showDeleteConfirm = false;
		userToDelete = null;
	}

	async function handleConfirmDelete() {
		if (!userToDelete) return;

		const formData = new FormData();
		formData.append('userId', userToDelete.id);

		const response = await fetch('?/deleteUser', {
			method: 'POST',
			body: formData
		});

		if (response.ok) {
			users = users.filter((u) => u.id !== userToDelete!.id);
			toast.success('User deleted successfully');
		} else {
			let errorDescription = 'An unknown error occurred while deleting the user.';
			try {
				const result = await response.json();
				errorDescription = result.error || errorDescription;
			} catch (e) {
				// The response was not JSON, which is fine. The server might have crashed.
			}
			toast.error('Failed to delete user', { description: errorDescription });
		}

		handleCloseDeleteConfirm();
	}

	async function handleSaveUser(event: CustomEvent) {
		const updatedUser = event.detail;

		const formData = new FormData();
		formData.append('userId', updatedUser.id);
		formData.append('email', updatedUser.email);
		formData.append('fullName', updatedUser.full_name || '');
		formData.append('role', updatedUser.user_metadata?.role || 'user');

		const response = await fetch('?/updateUser', {
			method: 'POST',
			body: formData
		});

		if (response.ok) {
			toast.success('User updated successfully');
			await invalidateAll(); // This will re-run the `load` function
		} else {
			let errorDescription = 'An unknown error occurred while updating the user.';
			try {
				const result = await response.json();
				errorDescription = result.error || errorDescription;
			} catch (e) {
				// The response was not JSON.
			}
			toast.error('Failed to update user', {
				description: errorDescription
			});
		}

		handleCloseModal();
	}

	onMount(() => {
		// Additional initialization code if needed
	});
</script>

<svelte:window />

{#if isModalOpen && selectedUser}
	<UserEditModal
		isOpen={isModalOpen}
		user={selectedUser}
		on:close={handleCloseModal}
		on:save={handleSaveUser}
	/>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm && userToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		on:click={handleCloseDeleteConfirm}
		on:keydown={handleModalKeydown}
		tabindex="-1"
		role="dialog"
		aria-label="Delete User Modal"
		aria-modal="true"
		aria-labelledby="delete-user-modal-title"
		aria-describedby="delete-user-modal-description"
	>
		<div
			class="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
		>
			<div class="flex items-center gap-3 mb-4">
				<div class="flex-shrink-0">
					<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
						<Trash2 class="h-6 w-6 text-red-600 dark:text-red-400" />
					</div>
				</div>
				<div>
					<h3 id="delete-user-modal-title" class="text-lg font-medium text-gray-900 dark:text-gray-100">Delete User</h3>
					<p id="delete-user-modal-description" class="text-sm text-gray-500 dark:text-gray-400">
						Are you sure you want to delete this user? This action cannot be undone.
					</p>
				</div>
			</div>

			<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
				<div class="flex items-center">
					<div>
						<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
							{getUserDisplayName(userToDelete)}
						</div>
						<div class="text-sm text-gray-500 dark:text-gray-400">{userToDelete.email}</div>
					</div>
				</div>
			</div>

			<div class="flex justify-end space-x-3">
				<button
					type="button"
					on:click={handleCloseDeleteConfirm}
					class="rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
				>
					Cancel
				</button>
				<button
					type="button"
					on:click={handleConfirmDelete}
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 cursor-pointer"
				>
					Delete User
				</button>
			</div>
		</div>
	</div>
{/if}

{#if data && data.isAdmin}
	<div>
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center gap-3">
				<Settings class="h-7 w-7 text-[rgb(37,140,244)]" />
				<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
					Server Admin Settings
				</h1>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="mb-6 border-b border-gray-200 dark:border-gray-700">
			<nav class="-mb-px flex space-x-8">
				<button
					class="py-2 px-1 border-b-2 font-medium text-sm {activeTab === 'users' ? 'border-[rgb(37,140,244)] text-[rgb(37,140,244)]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
					on:click={() => activeTab = 'users'}
				>
					<div class="flex items-center gap-2">
						<UserIcon class="h-4 w-4" />
						Users
					</div>
				</button>
				<button
					class="py-2 px-1 border-b-2 font-medium text-sm {activeTab === 'workers' ? 'border-[rgb(37,140,244)] text-[rgb(37,140,244)]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
					on:click={() => activeTab = 'workers'}
				>
					<div class="flex items-center gap-2">
						<Users class="h-4 w-4" />
						Workers
					</div>
				</button>
				<button
					class="py-2 px-1 border-b-2 font-medium text-sm {activeTab === 'settings' ? 'border-[rgb(37,140,244)] text-[rgb(37,140,244)]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
					on:click={() => activeTab = 'settings'}
				>
					<div class="flex items-center gap-2">
						<Server class="h-4 w-4" />
						Settings
					</div>
				</button>
			</nav>
		</div>

		<!-- Users Tab -->
		{#if activeTab === 'users'}
			<div class="mb-8 rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]">
				<div class="mb-4">
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">User Management</h2>
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
						Manage users and their permissions. Total users: {pagination.total}
						{#if searchQuery}
							(Showing {users.length} filtered results)
						{/if}
					</p>
				</div>

				<div class="mb-6 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<div class="relative">
							<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								bind:value={searchQuery}
								placeholder="Search users..."
								class="w-64 rounded-md border border-[rgb(218,218,221)] bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)] dark:border-[#3f3f46] dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-500"
								on:input={handleSearchInput}
							/>
						</div>
						<!-- Items per page selector -->
						<select
							bind:value={itemsPerPage}
							on:change={handleItemsPerPageChange}
							class="rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)] dark:border-[#3f3f46] dark:bg-[#23232a] dark:text-gray-100"
						>
							<option value={5}>5 per page</option>
							<option value={10}>10 per page</option>
							<option value={25}>25 per page</option>
							<option value={50}>50 per page</option>
						</select>
					</div>
					<button
						class="flex cursor-pointer items-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90"
						on:click={() => (showAddUserModal = true)}
					>
						<UserPlus class="h-4 w-4" />
						Add User
					</button>
				</div>

				<div
					class="overflow-hidden rounded-lg border border-[rgb(218,218,221)] bg-white dark:border-[#3f3f46] dark:bg-[#23232a]"
				>
					{#if users.length === 0}
						<div class="text-center py-8">
							<UserIcon class="mx-auto h-12 w-12 text-gray-400" />
							<h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No users found</h3>
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
								{searchQuery ? 'Try adjusting your search terms.' : 'No users have been created yet.'}
							</p>
						</div>
					{:else}
						<table class="min-w-full divide-y divide-[rgb(218,218,221)] dark:divide-[#3f3f46]">
							<thead class="bg-gray-50 dark:bg-[#2d2d35]">
								<tr>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
									>
										User
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
									>
										Role
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
									>
										Created
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
									>
										Status
									</th>
									<th scope="col" class="relative px-6 py-3">
										<span class="sr-only">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody
								class="divide-y divide-[rgb(218,218,221)] bg-white dark:divide-[#3f3f46] dark:bg-[#23232a]"
							>
								{#each users as user}
									<tr>
										<td class="whitespace-nowrap px-6 py-4">
											<div class="flex items-center">
												<div>
													<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
														{getUserDisplayName(user)}
													</div>
													<div class="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
												</div>
											</div>
										</td>
										<td class="whitespace-nowrap px-6 py-4">
											<span
												class="inline-flex rounded-full px-2 text-xs font-semibold leading-5 {user.is_admin
													? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
													: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'}"
											>
												{user.is_admin ? 'Admin' : 'User'}
											</span>
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
											{formatDate(user.created_at)}
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
											Active
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
											<div class="flex items-center justify-end gap-2">
												<button
													class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
													on:click={() => handleEditUser(user)}
													title="Edit user"
												>
													<Edit class="h-4 w-4" />
												</button>
												<button
													class="rounded p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 cursor-pointer"
													on:click={() => handleDeleteUser(user)}
													title="Delete user"
												>
													<Trash2 class="h-4 w-4" />
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>

						<!-- Pagination Controls -->
						{#if pagination.totalPages > 1}
							<div class="bg-white dark:bg-[#23232a] px-6 py-3 border-t border-[rgb(218,218,221)] dark:border-[#3f3f46]">
								<div class="flex items-center justify-between">
									<div class="flex items-center text-sm text-gray-700 dark:text-gray-300">
										<span>
											Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
										</span>
									</div>
									<div class="flex items-center space-x-2">
										<!-- Previous button -->
										<button
											on:click={goToPreviousPage}
											disabled={!pagination.hasPrev}
											class="relative inline-flex items-center rounded-md px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:bg-gray-700"
										>
											<span class="sr-only">Previous</span>
											<ChevronLeft class="h-5 w-5" />
										</button>

										<!-- Page numbers -->
										{#each getPageNumbers() as pageNum}
											<button
												on:click={() => goToPage(pageNum)}
												class="relative inline-flex items-center rounded-md px-3 py-2 text-sm font-medium {pageNum === currentPage
													? 'bg-[rgb(37,140,244)] text-white'
													: 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}"
											>
												{pageNum}
											</button>
										{/each}

										<!-- Next button -->
										<button
											on:click={goToNextPage}
											disabled={!pagination.hasNext}
											class="relative inline-flex items-center rounded-md px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:bg-gray-700"
										>
											<span class="sr-only">Next</span>
											<ChevronRight class="h-5 w-5" />
										</button>
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>
			</div>
		{/if}

		<!-- Workers Tab -->
		{#if activeTab === 'workers'}
			<WorkerManager />
		{/if}

		<!-- Settings Tab -->
		{#if activeTab === 'settings'}
			<div class="space-y-8">
				<!-- Server Settings -->
				<div class="rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6">
					<div class="mb-4">
						<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Server Settings</h2>
						<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Configure server-wide settings and policies.</p>
					</div>

					<div class="space-y-6">
						<!-- Server Name -->
						<div>
							<label for="serverName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Server Name</label>
							<div class="mt-1">
								<input
									type="text"
									id="serverName"
									bind:value={serverName}
									class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
									placeholder="Enter server name"
								/>
							</div>
						</div>

						<!-- Admin Email -->
						<div>
							<label for="adminEmail" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Admin Email</label>
							<div class="mt-1">
								<input
									type="email"
									id="adminEmail"
									bind:value={adminEmail}
									class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
									placeholder="admin@example.com"
								/>
							</div>
						</div>

						<!-- Max Users -->
						<div>
							<label for="maxUsers" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Maximum Users</label>
							<div class="mt-1">
								<input
									type="number"
									id="maxUsers"
									bind:value={maxUsers}
									class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
									placeholder="0 (unlimited)"
								/>
							</div>
						</div>

						<!-- Storage Limit -->
						<div>
							<label for="storageLimit" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Storage Limit (GB)</label>
							<div class="mt-1">
								<input
									type="number"
									id="storageLimit"
									bind:value={storageLimit}
									class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
									placeholder="0 (unlimited)"
								/>
							</div>
						</div>

						<!-- Registration Settings -->
						<div class="space-y-4">
							<div class="flex items-center">
								<input
									type="checkbox"
									id="allowRegistration"
									bind:checked={allowRegistration}
									class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
								/>
								<label for="allowRegistration" class="ml-2 block text-sm text-gray-900 dark:text-gray-100">
									Allow new user registration
								</label>
							</div>
							<div class="flex items-center">
								<input
									type="checkbox"
									id="requireEmailVerification"
									bind:checked={requireEmailVerification}
									class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
								/>
								<label for="requireEmailVerification" class="ml-2 block text-sm text-gray-900 dark:text-gray-100">
									Require email verification
								</label>
							</div>
						</div>
					</div>

					<!-- Save Button -->
					<div class="mt-6 flex justify-end">
						<button
							on:click={saveSettings}
							class="rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90"
						>
							Save Settings
						</button>
					</div>
				</div>

				<!-- Integrations -->
				<div class="rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6">
					<div class="mb-4">
						<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Integrations</h2>
						<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Configure third-party integrations and OAuth providers.</p>
					</div>

					<div class="space-y-6">
						{#each integrations as integration}
							<div class="rounded-lg border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-gray-50 dark:bg-[#2d2d35] p-4">
								<div class="flex items-center gap-3 mb-4">
									<svelte:component this={integration.icon} class="h-6 w-6 text-[rgb(37,140,244)]" />
									<div>
										<h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">{integration.title}</h3>
										<p class="text-sm text-gray-600 dark:text-gray-300">{integration.description}</p>
									</div>
								</div>

								<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
									{#each integration.fields as field}
										<div>
											<label for={field.id} class="block text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
											<div class="mt-1">
												{#if field.type === 'text'}
													<input
														type="text"
														id={field.id}
														bind:value={field.value}
														class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
														placeholder={field.placeholder}
													/>
												{:else if field.type === 'select'}
													<select
														id={field.id}
														bind:value={field.value}
														class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#3f3f46] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
													>
														{#each field.options || [] as option}
															<option value={option.value}>{option.label}</option>
														{/each}
													</select>
												{:else if field.type === 'checkbox'}
													<input
														type="checkbox"
														id={field.id}
														checked={typeof field.value === 'boolean' ? field.value : field.value === 'true'}
														on:change={(e) => field.value = e.currentTarget.checked}
														class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
													/>
												{/if}
												{#if field.description}
													<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<div class="flex h-64 items-center justify-center">
		<div class="text-center">
			<Settings class="mx-auto mb-4 h-12 w-12 text-gray-400" />
			<h2 class="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">Access Denied</h2>
			<p class="text-gray-600 dark:text-gray-300">You don't have permission to access this page.</p>
		</div>
	</div>
{/if}
