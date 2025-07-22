<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { User as UserIcon, Mail, X } from 'lucide-svelte';
	import RoleSelector from './RoleSelector.svelte';
	import UserAvatar from './ui/UserAvatar.svelte';
	import type { UserProfile } from '$lib/types/user.types';

	export let isOpen = false;
	export let user: UserProfile | null;

	let localUser: UserProfile;
	const dispatch = createEventDispatcher();

	$: if (user) {
		// Create a local copy to avoid modifying the original user object directly
		localUser = JSON.parse(JSON.stringify(user));
	}

	$: role = localUser?.role || 'user';

	function closeModal() {
		dispatch('close', undefined);
	}

	function saveUser() {
		dispatch('save', localUser);
	}
</script>

{#if isOpen && user}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
		on:click={closeModal}
		role="presentation"
		aria-hidden="true"
	>
		<div
			class="relative w-full max-w-lg rounded-xl bg-white p-8 shadow-2xl dark:bg-gray-800"
			on:click|stopPropagation
			role="document"
		>
			<!-- Modal Header -->
			<div class="mb-6 flex items-start justify-between">
				<div>
					<h2
						id="user-edit-modal-title"
						class="text-2xl font-bold text-gray-900 dark:text-gray-100"
					>
						Edit User
					</h2>
					<p class="text-gray-500 dark:text-gray-400">Update the user's details and role.</p>
				</div>
				<button
					on:click={closeModal}
					class="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
					aria-label="Close modal"
				>
					<X class="h-6 w-6" />
				</button>
			</div>

			<!-- User Info -->
			<div class="mb-8 flex items-center gap-4">
				<UserAvatar user={localUser} />
				<div>
					<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
						{localUser.full_name ||
							`${localUser.first_name || ''} ${localUser.last_name || ''}`.trim() ||
							'N/A'}
					</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">{localUser.email}</p>
				</div>
			</div>

			<!-- Form Fields -->
			<div class="space-y-6">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label
							for="firstName"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>First Name</label
						>
						<div class="relative">
							<UserIcon class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								id="firstName"
								bind:value={localUser.first_name}
								class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
								placeholder="e.g. Jane"
							/>
						</div>
					</div>

					<div>
						<label
							for="lastName"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Last Name</label
						>
						<div class="relative">
							<UserIcon class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								id="lastName"
								bind:value={localUser.last_name}
								class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
								placeholder="e.g. Doe"
							/>
						</div>
					</div>
				</div>

				<div>
					<label for="email" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>Email Address</label
					>
					<div class="relative">
						<Mail class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
						<input
							type="email"
							id="email"
							bind:value={localUser.email}
							class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
							placeholder="e.g. jane.doe@example.com"
						/>
					</div>
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
					<RoleSelector bind:role />
				</div>
			</div>

			<!-- Modal Footer -->
			<div class="mt-8 flex justify-end gap-3">
				<button
					on:click={closeModal}
					class="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Cancel
				</button>
				<button
					on:click={saveUser}
					class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
				>
					Save Changes
				</button>
			</div>
		</div>
	</div>
{/if}
