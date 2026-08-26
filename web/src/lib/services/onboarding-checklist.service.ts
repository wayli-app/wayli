import { fluxbase } from '$lib/fluxbase';

export interface ChecklistState {
	dismissed: boolean;
	completed_steps: string[];
	dismissed_at?: string;
}

export class OnboardingChecklistService {
	static async getChecklistState(userId: string): Promise<ChecklistState | null> {
		const { data, error } = await fluxbase
			.from<Record<string, any>>('user_preferences')
			.select('preferences')
			.eq('id', userId)
			.maybeSingle();

		if (error || !data) return null;
		const preferences = (data as any).preferences;
		return preferences?.onboarding_checklist || null;
	}

	/**
	 * Read the current preferences + checklist, resilient to a missing
	 * user_preferences row (returns empty defaults instead of throwing).
	 */
	private static async readState(userId: string): Promise<{
		preferences: Record<string, any>;
		checklist: ChecklistState;
	}> {
		const { data } = await fluxbase
			.from<Record<string, any>>('user_preferences')
			.select('preferences')
			.eq('id', userId)
			.maybeSingle();

		const preferences = ((data as any)?.preferences || {}) as any;
		const checklist = preferences.onboarding_checklist || {
			dismissed: false,
			completed_steps: []
		};
		return { preferences, checklist };
	}

	/**
	 * Write the preferences back, upserting the row if it doesn't exist yet
	 * (new users may not have a user_preferences row until preferences are
	 * first saved — an .update() without an error can still match 0 rows and
	 * silently no-op, so verify a row was actually written before returning).
	 */
	private static async writeState(userId: string, preferences: Record<string, any>): Promise<void> {
		const { data: updated, error: updateError } = await fluxbase
			.from<Record<string, any>>('user_preferences')
			.update({ preferences })
			.eq('id', userId)
			.select('id');

		if (!updateError && updated && updated.length > 0) return;
		await fluxbase.from<Record<string, any>>('user_preferences').upsert({
			id: userId,
			preferences
		});
	}

	static async markStepCompleted(userId: string, stepId: string): Promise<void> {
		const { preferences, checklist } = await this.readState(userId);

		if (!checklist.completed_steps.includes(stepId)) {
			checklist.completed_steps.push(stepId);
			await this.writeState(userId, {
				...preferences,
				onboarding_checklist: checklist
			});
		}
	}

	static async dismissChecklist(userId: string): Promise<void> {
		const { preferences, checklist } = await this.readState(userId);

		checklist.dismissed = true;
		checklist.dismissed_at = new Date().toISOString();

		await this.writeState(userId, {
			...preferences,
			onboarding_checklist: checklist
		});
	}
}
