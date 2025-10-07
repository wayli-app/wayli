# Environment Configuration Guide

This directory contains the centralized environment configuration system for the Wayli project. The configuration is separated into different contexts to ensure security and proper separation of concerns.

## 🏗️ Architecture Overview

The environment configuration follows a layered approach:

```
┌─────────────────────────────────────────────────────────────┐
│                    Environment Layers                       │
├─────────────────────────────────────────────────────────────┤
│  Server-Side (SvelteKit)                                    │
│  ├── server-environment.ts (Private variables)              │
│  └── $env/static/private                                    │
├─────────────────────────────────────────────────────────────┤
│  Worker (Node.js)                                           │
│  ├── worker-environment.ts (process.env)                    │
│  └── node-environment.ts (dotenv + process.env)             │
└─────────────────────────────────────────────────────────────┘
```

## 📁 File Structure

### `server-environment.ts` - Server-Side Configuration

- **Purpose**: Server-only configuration using SvelteKit's `$env/static/private`
- **Usage**: API routes, server actions, server-side load functions
- **Variables**: Service role keys, database URLs, secrets
- **Security**: Private variables only, never exposed to client

```typescript
// ✅ Safe for server-side
import { validateServerEnvironmentConfig } from '$lib/core/config/server-environment';

// ❌ Never import in client-side code
// This would cause build errors and security issues
```

### `worker-environment.ts` - Worker Configuration

- **Purpose**: Node.js worker environment using `process.env`
- **Usage**: Background workers, job processors, standalone Node.js processes
- **Variables**: Worker-specific configuration, process-level variables
- **Security**: Uses `process.env` for Node.js compatibility

```typescript
// ✅ Safe for worker processes
import { validateWorkerEnvironmentConfig } from '$lib/core/config/worker-environment';
```

### `node-environment.ts` - Node.js Configuration

- **Purpose**: Full Node.js environment with dotenv support
- **Usage**: CLI tools, development scripts, comprehensive Node.js apps
- **Variables**: Complete environment with dotenv variable substitution
- **Security**: Handles complex environment setups

```typescript
// ✅ Safe for Node.js processes
import { getNodeEnvironmentConfig } from './node-environment';
```

## 🔒 Security Guidelines

### ✅ Do's

- Use the appropriate config for each context
- Validate environment variables at startup
- Use TypeScript interfaces for type safety
- Handle missing variables gracefully
- Log configuration issues in development

### ❌ Don'ts

- Never import `$env/static/private` in client-side code
- Never import server configs in client components
- Never expose secrets in client bundles
- Never use `process.env` in SvelteKit server code
- Never hardcode sensitive values

## 🚀 Usage Examples

### Client-Side Configuration

```typescript
// src/routes/+page.svelte
// Note: Nominatim configuration is now handled directly in the service
// No client-side config needed at this time
```

### Server-Side Configuration

```typescript
// src/routes/api/v1/users/+server.ts
import { validateServerEnvironmentConfig } from '$lib/core/config/server-environment';

const config = validateServerEnvironmentConfig(true);
// config.supabase.url = 'https://your-project.supabase.co'
// config.supabase.serviceRoleKey = 'your-service-role-key'
```

### Worker Configuration

```typescript
// src/lib/services/workers/job-worker.service.ts
import { validateWorkerEnvironmentConfig } from '$lib/core/config/worker-environment';

const config = validateWorkerEnvironmentConfig();
// config.supabase.url = 'https://your-project.supabase.co'
// config.supabase.serviceRoleKey = 'your-service-role-key'
```

### Node.js Configuration

```typescript
// scripts/migrate.ts
import { getNodeEnvironmentConfig } from './node-environment';

const config = getNodeEnvironmentConfig();
// Full configuration with all environment variables
```

## 🔧 Environment Variables

### Public Variables (Client-Safe)

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NODE_ENV=development
```

### Private Variables (Server-Only)

```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
COOKIE_SECRET=your-cookie-secret
```

### Worker Variables (Node.js)

```env
WORKER_POLL_INTERVAL=5000
JOB_TIMEOUT=300000
RETRY_ATTEMPTS=3
RETRY_DELAY=1000
```

## 🧪 Testing

### Environment Variable Testing

```typescript
// tests/unit/config.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateServerEnvironmentConfig } from '$lib/core/config/server-environment';

describe('Server Environment Config', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('should validate required environment variables', () => {
		process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

		const config = validateServerEnvironmentConfig(true);
		expect(config.supabase.url).toBe('https://test.supabase.co');
		expect(config.supabase.serviceRoleKey).toBe('test-service-key');
	});
});
```

## 🚨 Common Issues

### Build Errors

If you see build errors like:

```
Error: Cannot import '$env/static/private' in client-side code
```

**Solution**: Move the import to a server-side file or use the appropriate client-safe config.

### Runtime Errors

If you see runtime errors like:

```
ReferenceError: process is not defined
```

**Solution**: Use SvelteKit's `$env/static/*` imports instead of `process.env` in SvelteKit code.

### Security Warnings

If you see security warnings like:

```
Warning: Sensitive environment variable exposed to client
```

**Solution**: Ensure you're using the correct config file for your context.

## 📚 Related Documentation

- [SvelteKit Environment Variables](https://kit.svelte.dev/docs/modules#$env-static-private)
- [Supabase Environment Setup](https://supabase.com/docs/guides/getting-started/environment-variables)
- [Node.js Environment Variables](https://nodejs.org/api/process.html#processenv)

## 🔄 Migration Guide

### From Direct Environment Imports

```typescript
// ❌ Old way
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// ✅ New way
import { validateServerEnvironmentConfig } from '$lib/core/config/server-environment';
const config = validateServerEnvironmentConfig();
```

### From Process.env in SvelteKit

```typescript
// ❌ Old way
const url = process.env.PUBLIC_SUPABASE_URL;

// ✅ New way
import { PUBLIC_SUPABASE_URL } from '$lib/supabase';
const url = PUBLIC_SUPABASE_URL;
```
