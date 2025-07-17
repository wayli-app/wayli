export function handleApiError(error: any, fallbackMessage = 'An error occurred') {
	if (error instanceof Error) {
		return new Error(error.message || fallbackMessage);
	}
	if (typeof error === 'string') {
		return new Error(error);
	}
	return new Error(fallbackMessage);
}
