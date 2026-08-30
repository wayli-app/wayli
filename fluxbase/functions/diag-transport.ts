import { createClient } from '@nimbleflux/fluxbase-sdk';
import { decodeAndPersist } from '../jobs/_shared/services/transport-mode/run-helpers.ts';

const url = Deno.env.get('FLUXBASE_URL')!;
const key = Deno.env.get('FLUXBASE_KEY')!;
const userId = Deno.env.get('USER_ID')!;
const db = createClient(url, key, { persist: false, autoRefresh: false }) as any;

console.log('diagnostic decode for', userId);
try {
  const updated = await decodeAndPersist(db, userId, new Date(), undefined as any, { reprocessAll: true });
  console.log('DONE, points updated:', updated);
} catch (err) {
  console.error('THREW:', err instanceof Error ? err.stack : String(err));
}
