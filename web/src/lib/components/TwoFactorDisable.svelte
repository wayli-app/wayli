<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X, Shield, AlertTriangle, Lock } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { UserService } from '$lib/services/user.service';

	export let open = false;

	const dispatch = createEventDispatcher();

	let password = '';
	let isDisabling = false;

	async function handleDisable2FA() {
		if (!password) {
			toast.error('Please enter your password');
			return;
		}

		isDisabling = true;
		try {
			// Call the new API endpoint for 2FA disable
			const response = await UserService.disableTwoFactor({ password });
			if (!response.success) throw new Error(response.message || 'Disable failed');
			toast.success('Two-factor authentication disabled successfully');
			dispatch('disabled');
			closeModal();
		} catch (error) {
			console.error('Error disabling 2FA:', error);
			toast.error('Failed to disable two-factor authentication');
		} finally {
			isDisabling = false;
		}
	}

	function closeModal() {
		open = false;
		password = '';
		dispatch('close');
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
		on:click={closeModal}
	>
		<!-- Modal -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
			on:click|stopPropagation
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
				<div class="flex items-center gap-3">
					<AlertTriangle class="h-6 w-6 text-red-500" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						Disable Two-Factor Authentication
					</h2>
				</div>
				<button
					on:click={closeModal}
					class="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-6">
				<div class="mb-6">
					<div class="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
						<AlertTriangle class="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
						<div>
							<h3 class="font-medium text-red-800 dark:text-red-200 mb-1">
								Security Warning
							</h3>
							<p class="text-sm text-red-700 dark:text-red-300">
								Disabling two-factor authentication will make your account less secure.
								You'll only need your password to sign in.
							</p>
						</div>
					</div>
				</div>

				<div class="mb-6">
					<label for="disablePassword" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">
						Enter Your Password
					</label>
					<div class="relative">
						<Lock class="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
						<input
							id="disablePassword"
							type="password"
							bind:value={password}
							placeholder="Enter your password to confirm"
							class="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
						/>
					</div>
					<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						You must enter your password to disable two-factor authentication.
					</p>
				</div>

				<!-- Action Buttons -->
				<div class="flex gap-3">
					<button
						on:click={closeModal}
						class="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md font-medium hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
					>
						Cancel
					</button>
					<button
						on:click={handleDisable2FA}
						disabled={isDisabling || !password}
						class="flex-1 bg-red-600 text-white px-4 py-2 rounded-md font-medium hover:bg-red-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isDisabling ? 'Disabling...' : 'Disable 2FA'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}