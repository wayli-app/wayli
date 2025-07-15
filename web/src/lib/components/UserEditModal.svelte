<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { User as UserIcon, Mail, Shield, X } from 'lucide-svelte';
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
		dispatch('close');
	}

	function handleSave() {
		// Update the role in the local user
		if (localUser) {
			localUser.role = role;
		}
		dispatch('save', localUser);
	}
</script>

{#if isOpen && user}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
		on:click={closeModal}
		on:keydown={(e) => e.key === 'Escape' && closeModal()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="user-edit-modal-title"
	>
		<div
			class="relative w-full max-w-lg rounded-xl bg-white p-8 shadow-2xl dark:bg-gray-800"
			on:click|stopPropagation
			role="document"
		>
			<!-- Modal Header -->
			<div class="flex items-start justify-between mb-6">
				<div>
					<h2 id="user-edit-modal-title" class="text-2xl font-bold text-gray-900 dark:text-gray-100">
						Edit User
					</h2>
					<p class="text-gray-500 dark:text-gray-400">Update the user's details and role.</p>
				</div>
				<button
					on:click={closeModal}
					class="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
					aria-label="Close modal"
				>
					<X class="h-6 w-6" />
				</button>
			</div>

			<!-- User Info -->
			<div class="flex items-center gap-4 mb-8">
				<UserAvatar user={localUser} />
				<div>
					<p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
						{localUser.full_name || `${localUser.first_name || ''} ${localUser.last_name || ''}`.trim() || 'N/A'}
					</p>
					<p class="text-sm text-gray-500 dark:text-gray-400">{localUser.email}</p>
				</div>
			</div>

			<!-- Form Fields -->
			<div class="space-y-6">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="firstName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
						<div class="relative">
							<UserIcon class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								id="firstName"
								bind:value={localUser.first_name}
								class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
								placeholder="e.g. Jane"
							/>
						</div>
					</div>

				<div>
						<label for="lastName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
					<div class="relative">
						<UserIcon class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
						<input
							type="text"
								id="lastName"
								bind:value={localUser.last_name}
							class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
								placeholder="e.g. Doe"
						/>
						</div>
					</div>
				</div>

				<div>
					<label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
					<div class="relative">
						<Mail class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
						<input
							type="email"
							id="email"
							bind:value={localUser.email}
							class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pl-10 pr-4 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500"
							placeholder="e.g. jane.doe@example.com"
						/>
					</div>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Role</label>
					<RoleSelector bind:role={role} />
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
					on:click={handleSave}
					class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
				>
					Save Changes
				</button>
			</div>
		</div>
	</div>
{/if}