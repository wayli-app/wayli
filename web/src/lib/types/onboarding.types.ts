export interface OnboardingStep {
	id: string;
	title: string;
	description: string;
	optional: boolean;
	completed: boolean;
}

export interface OnboardingState {
	currentStep: number;
	totalSteps: number;
	isActive: boolean;
}

export interface OnboardingCallbacks {
	onComplete: (homeAddress?: any) => Promise<void>;
	onSkip: () => Promise<void>;
}
