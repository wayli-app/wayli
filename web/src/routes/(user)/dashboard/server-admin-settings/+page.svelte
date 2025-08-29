<script lang="ts">
	import {
		Settings,
		User as UserIcon,
		UserPlus,
		Server,
		Search,
		Edit,
		Trash2,
		ChevronLeft,
		ChevronRight,
		X,
		Mail
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import RoleSelector from '$lib/components/RoleSelector.svelte';
	import UserAvatar from '$lib/components/ui/UserAvatar.svelte';
	import UserEditModal from '$lib/components/UserEditModal.svelte';
	import { translate } from '$lib/i18n';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { sessionStore } from '$lib/stores/auth';

	import type { UserProfile } from '$lib/types/user.types';

	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';

	// Use the reactive translation function
	let t = $derived($translate);

	// Initialize users from client-side data
	let users = $state<UserProfile[]>([]);
	let searchQuery = $state('');
	let debouncedSearchQuery = $state('');
	let currentPage = $state(1);
	let itemsPerPage = $state(10);

	// Initialize server settings
	let serverName = $state('');
	let adminEmail = $state('');
	let allowRegistration = $state(true);
	let requireEmailVerification = $state(false);
	let showAddUserModal = $state(false);
	let isModalOpen = $state(false);
	let selectedUser = $state<UserProfile | null>(null);
	let showDeleteConfirm = $state(false);
	let userToDelete = $state<UserProfile | null>(null);
	let searchTimeout: ReturnType<typeof setTimeout>;
	let activeTab = $state('settings'); // Add tab state - default to settings tab

	// Initialize pagination data
	let pagination = $state({
		page: 1,
		limit: 10,
		total: 0,
		totalPages: 0,
		hasNext: false,
		hasPrev: false
	});

	// Fetch initial data on mount
	onMount(async () => {
		// Set admin flag since this is an admin-only page
		isAdmin = true;

		// Debug: Show current user info
		const session = $sessionStore;
		if (session?.user) {
			console.log('🔍 [DEBUG] Current user ID:', session.user.id);
			console.log('🔍 [DEBUG] Current user email:', session.user.email);
			console.log('🔍 [DEBUG] Current user metadata:', session.user.user_metadata);
		}

		await fetchFilteredUsers();
	});

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
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const result = (await serviceAdapter.getAdminUsers({
				page: currentPage,
				limit: itemsPerPage
			})) as any;

			// Edge Functions return { success: true, data: ... }
			const responseData = result.data || result;
			users = responseData.users || [];
			pagination = responseData.pagination || {
				page: 1,
				limit: 10,
				total: 0,
				totalPages: 0,
				hasNext: false,
				hasPrev: false
			};

			// Check if current user is admin (assuming admin users can access this page)
			isAdmin = true;
		} catch (error: any) {
			console.error('Error fetching filtered users:', error);
			const errorMessage = error?.message || error?.error || 'Failed to fetch users';
			toast.error('Failed to fetch users', { description: errorMessage });
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

	function getUserDisplayName(user: UserProfile) {
		return (
			user.full_name ||
			`${user.first_name || ''} ${user.last_name || ''}`.trim() ||
			user.email?.split('@')[0] ||
			'Unknown User'
		);
	}

	async function saveSettings() {
		try {
			const session = $sessionStore;
			if (!session) throw new Error('No session found');

			const settings = {
				server_name: serverName,
				admin_email: adminEmail,
				allow_registration: allowRegistration,
				require_email_verification: requireEmailVerification
			};

			console.log('🔧 [ADMIN] Saving server settings:', settings);

			const serviceAdapter = new ServiceAdapter({ session });
			await serviceAdapter.updateServerSettings(settings);

			toast.success('Settings saved successfully');
		} catch (error: any) {
			console.error('Error saving settings:', error);
			const errorMessage = error?.message || error?.error || 'An unexpected error occurred.';
			toast.error('Failed to save settings', { description: errorMessage });
		}
	}

	function handleEditUser(user: UserProfile) {
		selectedUser = user;
		isModalOpen = true;
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

	function handleDeleteUser(user: UserProfile) {
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
			users = users.filter((u: UserProfile) => u.id !== userToDelete!.id);
			toast.success('User deleted successfully');
		} else {
			let errorDescription = 'An unknown error occurred while deleting the user.';
			try {
				const result = await response.json();
				errorDescription = result.error || result.message || errorDescription;
			} catch {
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
		formData.append('firstName', updatedUser.first_name || '');
		formData.append('lastName', updatedUser.last_name || '');
		formData.append('role', updatedUser.role || 'user');

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
				errorDescription = result.error || result.message || errorDescription;
			} catch {
				// The response was not JSON.
			}
			toast.error('Failed to update user', {
				description: errorDescription
			});
		}

		handleCloseModal();
	}

	async function loadServerSettings() {
		try {
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const result = (await serviceAdapter.getServerSettings()) as any;

			// Edge Functions return { success: true, data: ... }
			const settings = result.data || result;

			console.log('🔧 [ADMIN] Loaded server settings:', settings);

			serverName = settings.server_name || '';
			adminEmail = settings.admin_email || '';
			allowRegistration = settings.allow_registration ?? true;
			requireEmailVerification = settings.require_email_verification ?? false;

			console.log('🔧 [ADMIN] Processed settings:', {
				serverName,
				adminEmail,
				allowRegistration,
				requireEmailVerification
			});
		} catch (error: any) {
			console.error('Error loading server settings:', error);
			const errorMessage = error?.message || error?.error || 'Failed to load server settings';
			toast.error('Failed to load server settings', { description: errorMessage });
		}
	}

	onMount(() => {
		// Load server settings when component mounts
		loadServerSettings();
	});

	        // Add User Modal State
        let newUserEmail = $state('');
        let newUserFirstName = $state('');
        let newUserLastName = $state('');
        let newUserRole = $state<'admin' | 'user'>('user');

	// Admin state
	let isAdmin = $state(false);

	function handleCloseAddUserModal() {
		showAddUserModal = false;
		newUserEmail = '';
		newUserFirstName = '';
		newUserLastName = '';
		newUserRole = 'user';
	}

	async function handleAddUser() {
		if (!newUserEmail || !newUserFirstName || !newUserLastName) {
			toast.error('Please fill in all required fields');
			return;
		}

		try {
			const formData = new FormData();
			formData.append('email', newUserEmail);
			formData.append('firstName', newUserFirstName);
			formData.append('lastName', newUserLastName);
			formData.append('role', newUserRole);

			const response = await fetch('?/addUser', {
				method: 'POST',
				body: formData
			});

			if (response.ok) {
				toast.success('User added successfully');
				handleCloseAddUserModal();
				await invalidateAll(); // Refresh the user list
			} else {
				let errorDescription = 'An unknown error occurred while adding the user.';
				try {
					const result = await response.json();
					errorDescription = result.error || result.message || errorDescription;
				} catch {
					// The response was not JSON.
				}
				toast.error('Failed to add user', { description: errorDescription });
			}
		} catch (error: any) {
			console.error('Error adding user:', error);
			const errorMessage = error?.message || error?.error || 'An unexpected error occurred.';
			toast.error('Failed to add user', { description: errorMessage });
		}
	}
</script>

<svelte:head>
	<title>{t('serverAdmin.title')} - Wayli</title>
</svelte:head>

<svelte:window />

{#if isModalOpen && selectedUser}
	<UserEditModal
		isOpen={isModalOpen}
		user={selectedUser}
		onClose={handleCloseModal}
		onSave={(user) => handleSaveUser(new CustomEvent('save', { detail: user }))}
	/>
{/if}

<!-- Add User Modal -->
{#if showAddUserModal}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
		onclick={handleCloseAddUserModal}
		onkeydown={(e) => {
			if (e.key === 'Escape' || e.key === 'Enter') {
				handleCloseAddUserModal();
			}
		}}
		role="button"
		tabindex="0"
		aria-label="Close modal"
	>
		                                                <div
                        class="relative w-full max-w-lg rounded-xl bg-white p-8 shadow-2xl dark:bg-gray-800"
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={(e) => e.key === 'Escape' && handleCloseAddUserModal()}
                        role="document"
                        tabindex="0"
                >
			<!-- Modal Header -->
			<div class="mb-6 flex items-start justify-between">
				<div>
					<h2 id="add-user-modal-title" class="text-2xl font-bold text-gray-900 dark:text-gray-100">
						Add New User
					</h2>
					<p class="text-gray-500 dark:text-gray-400">Create a new user account.</p>
				</div>
				<button
					onclick={handleCloseAddUserModal}
					class="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
					aria-label="Close modal"
				>
					<X class="h-6 w-6" />
				</button>
			</div>

			<!-- Form Fields -->
			<div class="space-y-6">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="newUserFirstName"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>First Name *</label
						>
						<div class="relative">
							<UserIcon class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								id="newUserFirstName"
								bind:value={newUserFirstName}
								class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
								placeholder="e.g. Jane"
								required
							/>
						</div>
					</div>

					<div>
						<label
							for="newUserLastName"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Last Name *</label
						>
						<div class="relative">
							<UserIcon class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								id="newUserLastName"
								bind:value={newUserLastName}
								class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
								placeholder="e.g. Doe"
								required
							/>
						</div>
					</div>
				</div>

				<div>
					<label
						for="newUserEmail"
						class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>Email Address *</label
					>
					<div class="relative">
						<Mail class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
						<input
							type="email"
							id="newUserEmail"
							bind:value={newUserEmail}
							class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
							placeholder="e.g. jane.doe@example.com"
							required
						/>
					</div>
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label
					>
					<RoleSelector bind:role={newUserRole} />
				</div>
			</div>

			<!-- Modal Footer -->
			<div class="mt-8 flex justify-end gap-3">
				<button
					onclick={handleCloseAddUserModal}
					class="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Cancel
				</button>
				<button
					onclick={handleAddUser}
					class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
				>
					Add User
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm && userToDelete}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onclick={handleCloseDeleteConfirm}
		onkeydown={(e) => {
			if (e.key === 'Escape' || e.key === 'Enter') {
				handleCloseDeleteConfirm();
			}
		}}
		role="button"
		tabindex="0"
		aria-label="Close modal"
	>
		<div class="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
			<div class="mb-4 flex items-center gap-3">
				<div class="flex-shrink-0">
					<div
						class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20"
					>
						<Trash2 class="h-6 w-6 text-red-600 dark:text-red-400" />
					</div>
				</div>
				<div>
					<h3
						id="delete-user-modal-title"
						class="text-lg font-medium text-gray-900 dark:text-gray-100"
					>
						Delete User
					</h3>
					<p id="delete-user-modal-description" class="text-sm text-gray-500 dark:text-gray-400">
						Are you sure you want to delete this user? This action cannot be undone.
					</p>
				</div>
			</div>

			<div class="mb-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
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
					onclick={handleCloseDeleteConfirm}
					class="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleConfirmDelete}
					class="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
				>
					Delete User
				</button>
			</div>
		</div>
	</div>
{/if}

{#if isAdmin}
	<div>
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center gap-3">
				<Settings class="h-7 w-7 text-[rgb(37,140,244)]" />
				<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
					{t('serverAdmin.title')}
				</h1>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="mb-6 border-b border-gray-200 dark:border-gray-700">
			<nav class="-mb-px flex space-x-8">
				<button
					class="cursor-pointer border-b-2 px-1 py-2 text-sm font-medium {activeTab === 'settings'
						? 'border-[rgb(37,140,244)] text-[rgb(37,140,244)]'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					onclick={() => (activeTab = 'settings')}
				>
					<div class="flex items-center gap-2">
						<Server class="h-4 w-4" />
						{t('serverAdmin.general')}
					</div>
				</button>
				<button
					class="cursor-pointer border-b-2 px-1 py-2 text-sm font-medium {activeTab === 'users'
						? 'border-[rgb(37,140,244)] text-[rgb(37,140,244)]'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					onclick={() => (activeTab = 'users')}
				>
					<div class="flex items-center gap-2">
						<UserIcon class="h-4 w-4" />
						{t('serverAdmin.users')}
					</div>
				</button>
			</nav>
		</div>

		<!-- Users Tab -->
		{#if activeTab === 'users'}
			<div
				class="mb-8 rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
			>
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
							<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								bind:value={searchQuery}
								placeholder="Search users..."
								class="w-64 rounded-md border border-[rgb(218,218,221)] bg-white py-2 pr-4 pl-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-[#3f3f46] dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-500"
								oninput={handleSearchInput}
							/>
						</div>
						<!-- Items per page selector -->
						<select
							bind:value={itemsPerPage}
							onchange={handleItemsPerPageChange}
							class="rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-[#3f3f46] dark:bg-[#23232a] dark:text-gray-100"
						>
							<option value={5}>5 per page</option>
							<option value={10}>10 per page</option>
							<option value={25}>25 per page</option>
							<option value={50}>50 per page</option>
						</select>
					</div>
					<button
						class="flex cursor-pointer items-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90"
						onclick={() => (showAddUserModal = true)}
					>
						<UserPlus class="h-4 w-4" />
						Add User
					</button>
				</div>

				<div
					class="overflow-hidden rounded-lg border border-[rgb(218,218,221)] bg-white dark:border-[#3f3f46] dark:bg-[#23232a]"
				>
					{#if users.length === 0}
						<div class="py-8 text-center">
							<UserIcon class="mx-auto h-12 w-12 text-gray-400" />
							<h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
								No users found
							</h3>
							<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
								{searchQuery
									? 'Try adjusting your search terms.'
									: 'No users have been created yet.'}
							</p>
						</div>
					{:else}
						<table class="min-w-full divide-y divide-[rgb(218,218,221)] dark:divide-[#3f3f46]">
							<thead class="bg-gray-50 dark:bg-[#2d2d35]">
								<tr>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-300"
									>
										User
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-300"
									>
										Role
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-300"
									>
										Created
									</th>
									<th
										scope="col"
										class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-300"
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
								{#each users as user (user.id)}
									<tr>
										<td class="px-6 py-4 whitespace-nowrap">
											<div class="flex items-center gap-3">
												<UserAvatar {user} size="lg" />
												<div>
													<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
														{getUserDisplayName(user)}
													</div>
													<div class="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
												</div>
											</div>
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<span
												class="inline-flex rounded-full px-2 text-xs leading-5 font-semibold {user.role ===
												'admin'
													? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
													: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'}"
											>
												{user.role === 'admin' ? 'Admin' : 'User'}
											</span>
										</td>
										<td
											class="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400"
										>
											{formatDate(user.created_at)}
										</td>
										<td
											class="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400"
										>
											Active
										</td>
										<td class="px-6 py-4 text-right text-sm font-medium whitespace-nowrap">
											<div class="flex items-center justify-end gap-2">
												<button
													class="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
													onclick={() => handleEditUser(user)}
													title="Edit user"
												>
													<Edit class="h-4 w-4" />
												</button>
												<button
													class="cursor-pointer rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
													onclick={() => handleDeleteUser(user)}
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
							<div
								class="border-t border-[rgb(218,218,221)] bg-white px-6 py-3 dark:border-[#3f3f46] dark:bg-[#23232a]"
							>
								<div class="flex items-center justify-between">
									<div class="flex items-center text-sm text-gray-700 dark:text-gray-300">
										<span>
											Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(
												pagination.page * pagination.limit,
												pagination.total
											)} of {pagination.total} results
										</span>
									</div>
									<div class="flex items-center space-x-2">
										<!-- Previous button -->
										<button
											onclick={goToPreviousPage}
											disabled={!pagination.hasPrev}
											class="relative inline-flex items-center rounded-md px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
										>
											<span class="sr-only">Previous</span>
											<ChevronLeft class="h-5 w-5" />
										</button>

										<!-- Page numbers -->
										{#each getPageNumbers() as pageNum (pageNum)}
											<button
												onclick={() => goToPage(pageNum)}
												class="relative inline-flex items-center rounded-md px-3 py-2 text-sm font-medium {pageNum ===
												currentPage
													? 'bg-[rgb(37,140,244)] text-white'
													: 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'}"
											>
												{pageNum}
											</button>
										{/each}

										<!-- Next button -->
										<button
											onclick={goToNextPage}
											disabled={!pagination.hasNext}
											class="relative inline-flex items-center rounded-md px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
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

		<!-- Settings Tab -->
		{#if activeTab === 'settings'}
			<div class="space-y-8">
				<!-- Server Settings -->
				<div
					class="rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
				>
					<div class="mb-4">
						<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
							{t('serverAdmin.serverSettings')}
						</h2>
						<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
							{t('serverAdmin.serverSettingsDescription')}
						</p>
					</div>

					<div class="space-y-6">
						<!-- Server Name -->
						<div>
							<label
								for="serverName"
								class="block text-sm font-medium text-gray-700 dark:text-gray-300"
								>{t('serverAdmin.serverName')}</label
							>
							<div class="mt-1">
								<input
									type="text"
									id="serverName"
									bind:value={serverName}
									class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-[#3f3f46] dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-500"
									placeholder="Enter server name"
								/>
							</div>
						</div>

						<!-- Admin Email -->
						<div>
							<label
								for="adminEmail"
								class="block text-sm font-medium text-gray-700 dark:text-gray-300"
								>{t('serverAdmin.adminEmail')}</label
							>
							<div class="mt-1">
								<input
									type="email"
									id="adminEmail"
									bind:value={adminEmail}
									class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:border-[#3f3f46] dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-500"
									placeholder="admin@example.com"
								/>
							</div>
						</div>

						<!-- Registration Settings -->
						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<div>
									<label
										for="allowRegistration"
										class="block text-sm font-medium text-gray-900 dark:text-gray-100"
									>
										{t('serverAdmin.allowNewUserRegistration')}
									</label>
									<p class="text-sm text-gray-500 dark:text-gray-400">
										{t('serverAdmin.enablePublicUserRegistration')}
									</p>
								</div>
								<button
									type="button"
									id="allowRegistration"
									onclick={() => (allowRegistration = !allowRegistration)}
									class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-[rgb(37,140,244)] focus:ring-offset-2 focus:outline-none {allowRegistration
										? 'bg-[rgb(37,140,244)]'
										: 'bg-gray-200 dark:bg-gray-700'}"
									role="switch"
									aria-checked={allowRegistration}
									aria-label="Allow new user registration"
								>
									<span
										class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {allowRegistration
											? 'translate-x-5'
											: 'translate-x-0'}"
									></span>
								</button>
							</div>
							<div class="flex items-center justify-between">
								<div>
									<label
										for="requireEmailVerification"
										class="block text-sm font-medium text-gray-900 dark:text-gray-100"
									>
										{t('serverAdmin.requireEmailVerification')}
									</label>
									<p class="text-sm text-gray-500 dark:text-gray-400">
										{t('serverAdmin.requireEmailVerificationDescription')}
									</p>
								</div>
								<button
									type="button"
									id="requireEmailVerification"
									onclick={() => (requireEmailVerification = !requireEmailVerification)}
									class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-[rgb(37,140,244)] focus:ring-offset-2 focus:outline-none {requireEmailVerification
										? 'bg-[rgb(37,140,244)]'
										: 'bg-gray-200 dark:bg-gray-700'}"
									role="switch"
									aria-checked={requireEmailVerification}
									aria-label="Require email verification"
								>
									<span
										class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {requireEmailVerification
											? 'translate-x-5'
											: 'translate-x-0'}"
									></span>
								</button>
							</div>
						</div>
					</div>

					<!-- Save Button -->
					<div class="mt-6 flex justify-end">
						<button
							onclick={saveSettings}
							class="rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90"
						>
							{t('serverAdmin.saveSettings')}
						</button>
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
