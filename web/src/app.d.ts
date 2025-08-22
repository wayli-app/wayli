// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// All authentication is now handled client-side
		// No server-side locals or session handling needed
		interface PageData {
			// Page data will be loaded client-side
			// This interface is intentionally empty as data is loaded client-side
			_clientSide?: boolean;
		}
		// interface Error {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
