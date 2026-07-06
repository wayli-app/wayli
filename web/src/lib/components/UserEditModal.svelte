<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { User as UserIcon, Mail, X } from 'lucide-svelte';

	import RoleSelector from './RoleSelector.svelte';
	import UserAvatar from './ui/UserAvatar.svelte';

	import type { UserProfile } from '$lib/types/user.types';

	let {
		isOpen = false,
		user = null,
		onClose,
		onSave
	} = $props<{
		isOpen: boolean;
		user: UserProfile | null;
		onClose?: () => void;
		onSave?: (user: UserProfile) => void;
	}>();

	let localUser = $state<UserProfile | null>(null);

	$effect(() => {
		if (user) {
			// Create a local copy to avoid modifying the original user object directly
			localUser = JSON.parse(JSON.stringify(user));
			// Ensure role is always set to a valid value
			if (!localUser!.role || (localUser!.role !== 'admin' && localUser!.role !== 'user')) {
				localUser!.role = 'user';
			}
		}
	});

	// Handle Escape key globally
	$effect(() => {
		if (isOpen) {
			const handleKeydown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					closeModal();
				}
			};

			window.addEventListener('keydown', handleKeydown);

			return () => {
				window.removeEventListener('keydown', handleKeydown);
			};
		}
	});

	function closeModal() {
		if (onClose) {
			onClose();
		}
	}

	function saveUser() {
		if (onSave && localUser) {
			onSave(localUser);
		}
	}
</script>

{#if isOpen && user}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
		onclick={closeModal}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				closeModal();
			}
		}}
		role="button"
		tabindex="0"
		aria-label="Close modal"
	>
		<div
			class="relative w-full max-w-lg rounded-xl p-8 shadow-2xl bg-card"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<!-- Modal Header -->
			<div class="mb-6 flex items-start justify-between">
				<div>
					<h2
						id="user-edit-modal-title"
						class="text-2xl font-bold text-foreground"
					>
						Edit User
					</h2>
					<p class="text-muted-foreground">Update the user's details and role.</p>
				</div>
				<button
					onclick={closeModal}
					class="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted dark:hover:bg-muted"
					aria-label="Close modal"
				>
					<X class="h-6 w-6" />
				</button>
			</div>

			<!-- User Info -->
			{#if localUser}
				<div class="mb-8 flex items-center gap-4">
					<UserAvatar user={localUser} />
					<div>
						<p class="text-lg font-semibold text-foreground">
							{localUser.full_name ||
								`${localUser.first_name || ''} ${localUser.last_name || ''}`.trim() ||
								'N/A'}
						</p>
						<p class="text-sm text-muted-foreground">{localUser.email}</p>
					</div>
				</div>
			{/if}

			<!-- Form Fields -->
			{#if localUser}
				<div class="space-y-6">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label
								for="firstName"
								class="mb-1 block text-sm font-medium text-muted-foreground"
								>First Name</label
							>
							<div class="relative">
								<UserIcon class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
								<input
									type="text"
									id="firstName"
									bind:value={localUser.first_name}
									class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-primary focus:ring-primary dark:border-border dark:bg-muted dark:text-white dark:focus:border-primary dark:focus:ring-primary"
									placeholder="e.g. Jane"
								/>
							</div>
						</div>

						<div>
							<label
								for="lastName"
								class="mb-1 block text-sm font-medium text-muted-foreground"
								>Last Name</label
							>
							<div class="relative">
								<UserIcon class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
								<input
									type="text"
									id="lastName"
									bind:value={localUser.last_name}
									class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-primary focus:ring-primary dark:border-border dark:bg-muted dark:text-white dark:focus:border-primary dark:focus:ring-primary"
									placeholder="e.g. Doe"
								/>
							</div>
						</div>
					</div>

					<div>
						<label
							for="email"
							class="mb-1 block text-sm font-medium text-muted-foreground"
							>Email Address</label
						>
						<div class="relative">
							<Mail class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
							<input
								type="email"
								id="email"
								bind:value={localUser.email}
								class="w-full rounded-lg border border-gray-300 bg-gray-50 py-3 pr-4 pl-10 text-gray-900 focus:border-primary focus:ring-primary dark:border-border dark:bg-muted dark:text-white dark:focus:border-primary dark:focus:ring-primary"
								placeholder="e.g. jane.doe@example.com"
							/>
						</div>
					</div>

					<div>
						<span class="mb-2 block text-sm font-medium text-muted-foreground">Role</span
						>
						<RoleSelector bind:role={localUser.role} />
					</div>
				</div>
			{/if}

			<!-- Modal Footer -->
			<div class="mt-8 flex justify-end gap-3">
				<button
					onclick={closeModal}
					class="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-muted-foreground hover:bg-muted"
				>
					Cancel
				</button>
				<button
					onclick={saveUser}
					class="bg-primary hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
				>
					Save Changes
				</button>
			</div>
		</div>
	</div>
{/if}
