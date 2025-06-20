import { createClient } from '@supabase/supabase-js'
import { browser } from '$app/environment'
import { validateSupabaseConfig } from './supabase-config'

// Validate configuration on import
const config = validateSupabaseConfig()

export const supabase = createClient(config.url, config.anonKey, {
	auth: {
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: true,
		storage: browser ? {
			getItem: (key) => {
				console.log('🔍 [SUPABASE-STORAGE] Getting item:', key);
				// Try to get from cookies first, fallback to localStorage
				const cookies = document.cookie.split(';');

				for (const cookie of cookies) {
					const [name, value] = cookie.trim().split('=');
					if (name === key) {
						return value;
					}
				}
				// Fallback to localStorage
				const localValue = localStorage.getItem(key);
				console.log('🔍 [SUPABASE-STORAGE] Fallback localStorage value:', { key, value: localValue });
				return localValue;
			},
			setItem: (key, value) => {
				// Set in both cookies and localStorage
				document.cookie = `${key}=${value}; path=/; max-age=31536000; SameSite=Lax`;
				localStorage.setItem(key, value);
			},
			removeItem: (key) => {
				console.log('🔍 [SUPABASE-STORAGE] Removing item:', key);
				// Remove from both cookies and localStorage
				document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
				localStorage.removeItem(key);
				console.log('🔍 [SUPABASE-STORAGE] Storage after removal:', {
					cookies: document.cookie,
					localStorage: localStorage.getItem(key)
				});
			}
		} : undefined
	}
})

// Server-side client for admin operations
export const createServerClient = (accessToken?: string) => {
	return createClient(config.url, config.anonKey, {
		global: {
			headers: accessToken ? {
				Authorization: `Bearer ${accessToken}`
			} : {}
		}
	})
}