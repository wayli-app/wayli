// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			supabase: import('@supabase/supabase-js').SupabaseClient
			getSession(): Promise<import('@supabase/supabase-js').Session | null>
		}
		interface PageData {
			session: import('@supabase/supabase-js').Session | null
			user?: import('@supabase/supabase-js').User
		}
		// interface Error {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
