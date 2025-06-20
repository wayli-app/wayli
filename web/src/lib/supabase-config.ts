import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

export function validateSupabaseConfig() {
	const errors: string[] = []

	if (!PUBLIC_SUPABASE_URL) {
		errors.push('PUBLIC_SUPABASE_URL is not defined')
	} else if (!PUBLIC_SUPABASE_URL.startsWith('http')) {
		errors.push('PUBLIC_SUPABASE_URL must be a valid URL starting with http:// or https://')
	}

	if (!PUBLIC_SUPABASE_ANON_KEY) {
		errors.push('PUBLIC_SUPABASE_ANON_KEY is not defined')
	} else if (PUBLIC_SUPABASE_ANON_KEY.length < 20) {
		errors.push('PUBLIC_SUPABASE_ANON_KEY appears to be invalid (too short)')
	}

	if (errors.length > 0) {
		console.error('Supabase configuration errors:')
		errors.forEach(error => console.error(`- ${error}`))
		throw new Error(`Supabase configuration errors: ${errors.join(', ')}`)
	}

	return {
		url: PUBLIC_SUPABASE_URL,
		anonKey: PUBLIC_SUPABASE_ANON_KEY
	}
}