/**
 * Admin user management for the server-admin-settings page.
 *
 * This is the repo-managed home for the `admin-users` function that
 * previously existed only on the originally-deployed instance (wayli#277):
 * fresh deployments had no user management at all, and the user list could
 * not show or search emails because `user_profiles` has no email column —
 * only the service role may read `auth.users`.
 *
 * Every action requires the CALLER to hold a Wayli `admin` profile role;
 * the check runs here against the service client, so the page's client-side
 * gate is UX, not security. Data sources per action:
 *   listUsers  — auth users (email, created_at) via admin.listUsers, merged
 *                with the matching user_profiles rows (names, Wayli role,
 *                avatar). Search spans email (admin API) AND profile names
 *                (ilike); name-only matches are resolved via getUserById,
 *                capped so a huge instance can't fan out unbounded.
 *   addUser    — auth.signUp (password account with profile metadata), then
 *                an upsert of the Wayli profile with the requested role —
 *                service-role writes are the sanctioned server-side role
 *                assignment path (the schema clamps client role/id writes).
 *   updateUser — profile fields via the service client; email changes go
 *                through PATCH /api/v1/admin/users/:id with the injected
 *                service token (the SDK has no admin-update wrapper).
 *   deleteUser — admin.deleteUser; the tenant FK cascades remove the
 *                profile, trips and tracker data (see delete-account.ts for
 *                the cascade map).
 *
 * Invoked with `namespace: 'wayli'` (sync:functions deploys there); any old
 * default-namespace copy on a live instance is orphaned by this deployment.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 120
 * @fluxbase:allow-env true
 * @fluxbase:allow-net true
 */

import type { FluxbaseClient } from '../jobs/types'

/** Upper bound for search-path fan-out (admin email matches / name matches). */
const SEARCH_WINDOW = 200

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Wayli profile role of the caller, resolved with the service client. */
async function isWayliAdmin(fluxbaseService: FluxbaseClient, userId: string): Promise<boolean> {
  const { data } = await fluxbaseService
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  return (data as { role?: string } | null)?.role === 'admin'
}

function pagination(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit)
  return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
}

/** Merge auth-user records with their Wayli profile rows (profiles win on names). */
function mergeUsers(
  authUsers: Array<Record<string, any>>,
  profiles: Array<Record<string, any>>,
): Array<Record<string, any>> {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  return authUsers.map((u) => {
    const p = byId.get(u.id) ?? {}
    return {
      id: u.id,
      email: u.email,
      email_verified: u.email_verified,
      created_at: u.created_at,
      updated_at: u.updated_at,
      last_sign_in: u.last_sign_in,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      full_name: p.full_name ?? null,
      username: p.username ?? null,
      avatar_url: p.avatar_url ?? null,
      // The Wayli profile role is what the admin UI displays and edits — the
      // auth role is the platform's own concept (user/admin/instance_admin).
      role: p.role ?? 'user',
    }
  })
}

async function listUsers(
  fluxbaseService: FluxbaseClient,
  page: number,
  limit: number,
  search: string | null,
): Promise<{ users: Array<Record<string, any>>; total: number }> {
  if (!search) {
    const offset = (page - 1) * limit
    const { data, error } = await fluxbaseService.admin.listUsers({ limit, offset })
    if (error || !data) throw new Error(error?.message || 'Failed to list users')
    const profiles = data.users.length
      ? await fluxbaseService
        .from('user_profiles')
        .select('id, first_name, last_name, full_name, username, avatar_url, role')
        .in('id', data.users.map((u) => u.id))
      : { data: [] }
    return {
      users: mergeUsers(data.users, (profiles.data as Array<Record<string, any>>) ?? []),
      total: data.total,
    }
  }

  // Search spans email AND profile names: take email matches from the admin
  // API, resolve name matches profile-first via getUserById, dedupe, then
  // paginate in-function. The per-source caps bound the fan-out.
  const { data: emailMatches, error } = await fluxbaseService.admin.listUsers({
    search,
    limit: SEARCH_WINDOW,
  })
  if (error || !emailMatches) throw new Error(error?.message || 'Failed to search users')

  const like = `%${search.replace(/[,()%_]/g, ' ')}%`
  const { data: nameProfiles } = await fluxbaseService
    .from('user_profiles')
    .select('id, first_name, last_name, full_name, username, avatar_url, role')
    .or(
      `full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},username.ilike.${like}`,
    )
    .limit(SEARCH_WINDOW)

  const byId = new Map(emailMatches.users.map((u) => [u.id, u]))
  const nameOnlyIds = ((nameProfiles?.data as Array<Record<string, any>>) ?? [])
    .map((p) => p.id)
    .filter((id) => !byId.has(id))
    .slice(0, SEARCH_WINDOW)
  const nameAuthUsers = (
    await Promise.all(
      nameOnlyIds.map((id) => fluxbaseService.admin.getUserById(id).then((r) => r.data)),
    )
  ).filter(Boolean) as Array<Record<string, any>>

  const allProfiles = [
    ...((nameProfiles?.data as Array<Record<string, any>>) ?? []),
    ...((await fluxbaseService
      .from('user_profiles')
      .select('id, first_name, last_name, full_name, username, avatar_url, role')
      .in(
        'id',
        emailMatches.users.map((u) => u.id),
      ))?.data as Array<Record<string, any>>),
  ]
  const merged = mergeUsers([...emailMatches.users, ...nameAuthUsers], allProfiles).sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  )
  return { users: merged, total: merged.length }
}

async function handler(
  req: Request,
  _fluxbase: FluxbaseClient,
  fluxbaseService: FluxbaseClient | null,
  _utils?: { getExecutionContext?: () => { user?: { id: string } } },
): Promise<Response> {
  const callerId = _utils?.getExecutionContext?.()?.user?.id
  if (!callerId) return json({ error: 'Unauthorized' }, 401)
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
  if (!fluxbaseService) {
    return json({ error: 'No tenant context — admin user management unavailable' }, 503)
  }
  if (!(await isWayliAdmin(fluxbaseService, callerId))) {
    return json({ error: 'Admin access required' }, 403)
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    switch (body.action) {
      case 'listUsers': {
        const page = Math.max(1, Number(body.page) || 1)
        const limit = Math.min(100, Math.max(1, Number(body.limit) || 20))
        const search = typeof body.search === 'string' ? body.search.trim() : ''
        const { users, total } = await listUsers(fluxbaseService, page, limit, search || null)
        const window = search ? users.slice((page - 1) * limit, page * limit) : users
        return json({ success: true, users: window, pagination: pagination(page, limit, total) })
      }

      case 'addUser': {
        const email = String(body.email ?? '').trim()
        const password = String(body.password ?? '')
        if (!email || password.length < 6) {
          return json({ error: 'Email and a password of at least 6 characters are required' }, 400)
        }
        const firstName = String(body.firstName ?? '').trim()
        const lastName = String(body.lastName ?? '').trim()
        const role = body.role === 'admin' ? 'admin' : 'user'
        const { data, error } = await fluxbaseService.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: `${firstName} ${lastName}`.trim(),
            },
          },
        })
        if (error || !data?.user) {
          return json({ error: error?.message || 'Failed to create user' }, 400)
        }
        // The profile row may not exist yet (bootstrapped on first sign-in);
        // upsert so the requested Wayli role and names are authoritative.
        await fluxbaseService.from('user_profiles').upsert({
          id: data.user.id,
          first_name: firstName || null,
          last_name: lastName || null,
          full_name: `${firstName} ${lastName}`.trim() || null,
          role,
        })
        return json({ success: true, userId: data.user.id })
      }

      case 'updateUser': {
        const userId = String(body.userId ?? '')
        if (!userId) return json({ error: 'userId is required' }, 400)
        const profileUpdate: Record<string, unknown> = {}
        if (body.firstName !== undefined || body.lastName !== undefined) {
          const firstName = String(body.firstName ?? '').trim()
          const lastName = String(body.lastName ?? '').trim()
          profileUpdate.first_name = firstName || null
          profileUpdate.last_name = lastName || null
          profileUpdate.full_name = `${firstName} ${lastName}`.trim() || null
        }
        if (body.role !== undefined) {
          profileUpdate.role = body.role === 'admin' ? 'admin' : 'user'
        }
        if (Object.keys(profileUpdate).length) {
          const { error } = await fluxbaseService
            .from('user_profiles')
            .update(profileUpdate)
            .eq('id', userId)
          if (error) return json({ error: error.message }, 500)
        }
        if (body.email !== undefined && String(body.email).trim()) {
          const baseUrl = Deno.env.get('FLUXBASE_URL')
          const serviceToken = Deno.env.get('FLUXBASE_SERVICE_TOKEN')
          if (!baseUrl || !serviceToken) {
            return json({ error: 'Service credentials unavailable for email update' }, 503)
          }
          const res = await fetch(`${baseUrl}/api/v1/admin/users/${userId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({ email: String(body.email).trim() }),
          })
          if (!res.ok) {
            const detail = await res.text()
            return json(
              { error: `Failed to update email: ${res.status} ${detail.slice(0, 200)}` },
              500,
            )
          }
        }
        return json({ success: true })
      }

      case 'deleteUser': {
        const userId = String(body.userId ?? '')
        if (!userId) return json({ error: 'userId is required' }, 400)
        if (userId === callerId) {
          return json({ error: 'Admins cannot delete their own account here' }, 400)
        }
        const { error } = await fluxbaseService.admin.deleteUser(userId)
        if (error) return json({ error: error.message }, 500)
        return json({ success: true })
      }

      default:
        return json({ error: `Unknown action: ${body.action}` }, 400)
    }
  } catch (err) {
    return json({ error: (err as Error)?.message || 'Internal error' }, 500)
  }
}

export default handler
