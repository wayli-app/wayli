<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { cn } from '$lib/utils';
	import {
		formAccessibility,
		ariaHelpers,
		motionPreferences
	} from '$lib/accessibility/accessibility-utils';

	export let type: string = 'text';
	export let className: string = '';
	export let disabled = false;
	export let value: string = '';
	export let label: string | undefined = undefined;
	export let placeholder: string = '';
	export let required = false;
	export let error: string | undefined = undefined;
	export let helperText: string | undefined = undefined;
	export let describedBy: string | undefined = undefined;
	export let autoComplete: string | undefined = undefined;
	export let inputMode: string | undefined = undefined;
	export let pattern: string | undefined = undefined;
	export let minLength: number | undefined = undefined;
	export let maxLength: number | undefined = undefined;

	const dispatch = createEventDispatcher();

	let inputElement: HTMLInputElement;
	let labelElement: HTMLLabelElement;
	let inputId: string;

	onMount(() => {
		// Generate unique ID for input
		inputId = ariaHelpers.generateId('input');

		if (inputElement && labelElement) {
			// Associate label with input
			formAccessibility.associateLabel(inputElement, labelElement);
		}

		// Apply reduced motion preferences
		if (inputElement) {
			motionPreferences.applyReducedMotion(inputElement);
		}
	});

    // Handle error state changes
    // We render a single visible error element with role="alert" below.
    // Avoid injecting a duplicate sr-only error to keep a single source of truth for screen readers.

	// Combine describedBy with error ID if error exists
	$: finalDescribedBy = error ? `${describedBy || ''} ${inputId}-error`.trim() : describedBy;

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		value = target.value;
		dispatch('input', event);
	}

	function handleChange(event: Event) {
		dispatch('change', event);
	}

	function handleFocus(event: FocusEvent) {
		dispatch('focus', event);
	}

	function handleBlur(event: FocusEvent) {
		dispatch('blur', event);
	}

	function handleKeydown(event: KeyboardEvent) {
		dispatch('keydown', event);
	}
</script>

<div class="space-y-2">
	{#if label}
		<label
			bind:this={labelElement}
			for={inputId}
			class="block text-sm font-medium text-gray-700 dark:text-gray-300"
		>
			{label}
			{#if required}
				<span class="ml-1 text-red-500" aria-label="required">*</span>
			{/if}
		</label>
	{/if}

	<div class="relative">
		<input
			bind:this={inputElement}
			{type}
			{disabled}
			{required}
			{placeholder}
			{autoComplete}
			{inputMode}
			{pattern}
			{minLength}
			{maxLength}
			bind:value
			id={inputId}
			aria-describedby={finalDescribedBy}
			aria-invalid={error ? 'true' : 'false'}
			on:input={handleInput}
			on:change={handleChange}
			on:focus={handleFocus}
			on:blur={handleBlur}
			on:keydown={handleKeydown}
			class={cn(
				'ring-offset-background flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-400',
				error && 'border-red-500 focus-visible:ring-red-500',
				className
			)}
			{...$$restProps}
		/>
	</div>

	{#if error}
		<div id="{inputId}-error" class="text-sm text-red-600 dark:text-red-400" role="alert">
			{error}
		</div>
	{/if}

	{#if helperText && !error}
		<div class="text-sm text-gray-500 dark:text-gray-400">
			{helperText}
		</div>
	{/if}
</div>
