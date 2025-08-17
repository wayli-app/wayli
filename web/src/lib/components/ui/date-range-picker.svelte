<script lang="ts">
	import { DatePicker } from '@svelte-plugins/datepicker';
	import { format } from 'date-fns';

	let {
		startDate = $bindable(),
		endDate = $bindable(),
		isOpen = $bindable(false),
		dateFormat = $bindable('MMM d, yyyy'),
		pickLabel = $bindable('Pick a date'),
		showClear = $bindable(true),
		onChange
	} = $props<{
		startDate?: string | Date;
		endDate?: string | Date;
		isOpen?: boolean;
		dateFormat?: string;
		pickLabel?: string;
		showClear?: boolean;
		onChange?: () => void;
	}>();

	const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

	export function getDateFromToday(days: number) {
		return new Date(Date.now() - days * MILLISECONDS_IN_DAY);
	}

	function formatDate(date: string | Date) {
		if (!date || isNaN(new Date(date).getTime())) return '';
		return format(new Date(date), dateFormat);
	}

	const onClearDates = () => {
		startDate = '';
		endDate = '';
		if (onChange) {
			onChange();
		}
	};

	const toggleDatePicker = () => (isOpen = !isOpen);

	let formattedStartDate = $derived(() => formatDate(startDate));
	let formattedEndDate = $derived(() => formatDate(endDate));

	function handleChange() {
		if (onChange) {
			onChange();
		}
	}

	function handleClearClick(event: MouseEvent) {
		event.stopPropagation();
		onClearDates();
	}
</script>

<div class="date-filter">
	<DatePicker bind:isOpen bind:startDate bind:endDate isRange showPresets onchange={handleChange}>
		<button
			type="button"
			class="date-field"
			role="button"
			aria-label={pickLabel}
			tabindex="0"
			onclick={toggleDatePicker}
			class:open={isOpen}
			style="cursor:pointer;"
		>
			<i class="icon-calendar"></i>
			<div class="date">
				{#if startDate}
					{formattedStartDate()} - {formattedEndDate()}
				{:else}
					{pickLabel}
				{/if}
			</div>
			{#if showClear && startDate}
				<span
					role="button"
					aria-label="Clear dates"
					tabindex="0"
					onclick={handleClearClick}
					style="cursor:pointer;"
				>
					<i class="os-icon-x"></i>
				</span>
			{/if}
		</button>
	</DatePicker>
</div>

<style>
	.date-field {
		align-items: center;
		background-color: #fff;
		border-bottom: 1px solid #e8e9ea;
		display: inline-flex;
		gap: 8px;
		min-width: 100px;
		padding: 16px;
	}
	.date-field.open {
		border-bottom: 1px solid #0087ff;
	}
	.date-field .icon-calendar {
		background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAEmSURBVHgB7ZcPzcIwEMUfXz4BSCgKwAGgACRMAg6YBBxsOMABOAAHFAXgAK5Z2Y6lHbfQ8SfpL3lZaY/1rb01N+BHUKSMNBfEJjZWISA56Uo6C2KvVpkgFn9oRx9vICFtUT1JKO3tvRtZdjBxXQs+YY+1FenIfuesPUGVVLzfRWKvmrSzbbN19wS+kAb2+sCEuUxrYzkbe4YvCVM2Vr5NPAkVa+van7Wn38U95uTpN5TJ/A8ZKemAakmbmJJGpI0gVmwA0huieFItjG19DgTHtwIZhCfZq3ztCuzQYh+FKBSvusjAGs8PnLYkLgMf34JoIBqIBqKBaIAb0Kw9RlhMCTbzzPWAqYq7LsuPaGDUsYmznaOk5zChUJTNQ4TFVMkrOL4HPsoNn26PxROHCggAAAAASUVORK5CYII=)
			no-repeat center center;
		background-size: 14px 14px;
		height: 14px;
		width: 14px;
	}
</style>
