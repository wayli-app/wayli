import { createClient } from '@supabase/supabase-js'

// Get environment variables for workers
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

export function validateSupabaseConfig() {
	const errors: string[] = []

	if (!SUPABASE_URL) {
		errors.push('PUBLIC_SUPABASE_URL or SUPABASE_URL is not defined')
	} else if (!SUPABASE_URL.startsWith('http')) {
		errors.push('SUPABASE_URL must be a valid URL starting with http:// or https://')
	}

	if (!SUPABASE_ANON_KEY) {
		errors.push('PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY is not defined')
	} else if (SUPABASE_ANON_KEY.length < 20) {
		errors.push('SUPABASE_ANON_KEY appears to be invalid (too short)')
	}

	if (errors.length > 0) {
		console.error('Supabase configuration errors:')
		errors.forEach(error => console.error(`- ${error}`))
		throw new Error(`Supabase configuration errors: ${errors.join(', ')}`)
	}

	return {
		url: SUPABASE_URL!,
		anonKey: SUPABASE_ANON_KEY!
	}
}

// Validate configuration on import
const config = validateSupabaseConfig()

export const supabase = createClient(config.url, config.anonKey, {
	auth: {
		autoRefreshToken: true,
		persistSession: false, // Workers don't need to persist sessions
		detectSessionInUrl: false
	}
})

// Server-side client for admin operations
export const createServerClient = (accessToken?: string) => {
	return createClient(config.url, config.anonKey, {
		global: {
			headers: accessToken ? {
				Authorization: `Bearer ${accessToken}`,
			} : undefined
		}
	})
}