import type { RequestEvent } from '@sveltejs/kit';
import { AuthenticationError, AuthorizationError, handleError, logError } from '$lib/utils/errors/error-handler';

export interface AuthenticatedRequest extends RequestEvent {
  user: {
    id: string;
    email: string;
    role: string;
    metadata: Record<string, unknown>;
  };
}

export async function requireAuth(event: RequestEvent): Promise<AuthenticatedRequest> {
  try {
    const session = await event.locals.getSession();

    if (!session?.user) {
      throw new AuthenticationError('Authentication required');
    }

    return {
      ...event,
      user: {
        id: session.user.id,
        email: session.user.email || '',
        role: session.user.user_metadata?.role || 'user',
        metadata: session.user.user_metadata || {}
      }
    };
  } catch (error) {
    const appError = handleError(error);
    logError(appError, { endpoint: event.url.pathname });
    throw appError;
  }
}

export async function requireRole(
  event: RequestEvent,
  requiredRole: string | string[]
): Promise<AuthenticatedRequest> {
  const authenticatedEvent = await requireAuth(event);
  const userRole = authenticatedEvent.user.role;
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  if (!requiredRoles.includes(userRole)) {
    throw new AuthorizationError(
      `Insufficient permissions. Required role: ${requiredRoles.join(' or ')}, got: ${userRole}`
    );
  }

  return authenticatedEvent;
}

export async function requireAdmin(event: RequestEvent): Promise<AuthenticatedRequest> {
  return requireRole(event, 'admin');
}

export function optionalAuth(event: RequestEvent): Promise<AuthenticatedRequest | RequestEvent> {
  return event.locals.getSession()
    .then(session => {
      if (session?.user) {
        return {
          ...event,
          user: {
            id: session.user.id,
            email: session.user.email || '',
            role: session.user.user_metadata?.role || 'user',
            metadata: session.user.user_metadata || {}
          }
        } as AuthenticatedRequest;
      }
      return event;
    })
    .catch(() => event);
}