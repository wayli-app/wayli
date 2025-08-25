# 🏗️ Wayli Project Architecture

## Directory Structure

This project follows a clear separation between different runtime environments to ensure code safety and maintainability.

```
web/src/
├── client/           # 🖥️ Client-side only code (browser)
│   ├── components/   # Svelte components
│   ├── stores/       # Client-side stores
│   ├── utils/        # Client-side utilities
│   ├── services/     # Client-side services
│   ├── i18n/         # Internationalization
│   ├── environment.ts # Client environment config
│   └── index.ts      # Client exports
├── server/           # 🖥️ Server-side only code (SvelteKit)
│   ├── services/     # Server-side services
│   ├── middleware/   # Server middleware
│   ├── utils/        # Server utilities
│   ├── environment.ts # Server environment config
│   └── index.ts      # Server exports
├── worker/           # ⚙️ Worker-only code (background processes)
│   ├── services/     # Worker services
│   ├── processors/   # Job processors
│   ├── utils/        # Worker utilities
│   ├── environment.ts # Worker environment config
│   ├── index.ts      # Worker exports
│   └── entry.ts      # Worker entry point
├── shared/           # 🔄 Shared code (all environments)
│   ├── types/        # Shared TypeScript types
│   ├── constants/    # Shared constants
│   ├── utils/        # Shared utilities
│   ├── supabase/     # Supabase client configurations
│   ├── environment.ts # Shared environment config
│   └── index.ts      # Shared exports
└── routes/           # 🛣️ SvelteKit routes (client + server)
```

## 🚨 Import Rules

### 1. **Client Code** (`client/`)
- ✅ Can import from `client/` and `shared/`
- ❌ **NEVER** import from `server/` or `worker/`
- ❌ **NEVER** import `$env/static/private`
- ✅ Safe to import `$env/static/public`

**Example:**
```typescript
// ✅ CORRECT - Client imports
import { CLIENT_ENVIRONMENT } from '$lib/client/environment';
import { UserType } from '$lib/shared/types';

// ❌ WRONG - Client importing server code
import { SERVER_ENVIRONMENT } from '$lib/server/environment'; // This will break!
```

### 2. **Server Code** (`server/`)
- ✅ Can import from `server/` and `shared/`
- ❌ **NEVER** import from `client/` or `worker/`
- ✅ Safe to import `$env/static/private`
- ✅ Safe to import `$env/static/public`

**Example:**
```typescript
// ✅ CORRECT - Server imports
import { SERVER_ENVIRONMENT } from '$lib/server/environment';
import { UserType } from '$lib/shared/types';

// ❌ WRONG - Server importing client code
import { CLIENT_ENVIRONMENT } from '$lib/client/environment'; // This will break!
```

### 3. **Worker Code** (`worker/`)
- ✅ Can import from `worker/` and `shared/`
- ❌ **NEVER** import from `client/` or `server/`
- ✅ Safe to import `process.env`
- ✅ Safe to import `$env/static/private` (if available)

**Example:**
```typescript
// ✅ CORRECT - Worker imports
import { WORKER_ENVIRONMENT } from '$lib/worker/environment';
import { UserType } from '$lib/shared/types';

// ❌ WRONG - Worker importing client code
import { CLIENT_ENVIRONMENT } from '$lib/client/environment'; // This will break!
```

### 4. **Shared Code** (`shared/`)
- ✅ Can import from `shared/` only
- ❌ **NEVER** import from `client/`, `server/`, or `worker/`
- ❌ **NEVER** import environment-specific modules
- ✅ Safe to import only truly shared utilities and types

**Example:**
```typescript
// ✅ CORRECT - Shared imports
import { UserType } from './types';
import { formatDate } from './utils';

// ❌ WRONG - Shared importing environment-specific code
import { CLIENT_ENVIRONMENT } from '../client/environment'; // This will break!
```

## 🔧 Environment Configuration

### Client Environment (`client/environment.ts`)
```typescript
export const CLIENT_ENVIRONMENT = {
  IS_CLIENT: true,
  IS_SERVER: false,
  IS_WORKER: false,
  // Client-safe configuration only
};
```

### Server Environment (`server/environment.ts`)
```typescript
export const SERVER_ENVIRONMENT = {
  IS_CLIENT: false,
  IS_SERVER: true,
  IS_WORKER: false,
  // Server-safe configuration (can access private env vars)
};
```

### Worker Environment (`worker/environment.ts`)
```typescript
export const WORKER_ENVIRONMENT = {
  IS_CLIENT: false,
  IS_SERVER: false,
  IS_WORKER: true,
  // Worker-safe configuration (can access process.env)
};
```

### Shared Environment (`shared/environment.ts`)
```typescript
export const ENVIRONMENT = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Only truly shared configuration
};
```

## 📝 File Naming Conventions

- **Client files**: No suffix (e.g., `user.service.ts`)
- **Server files**: `.server.ts` suffix (e.g., `auth.service.server.ts`)
- **Worker files**: `.worker.ts` suffix (e.g., `job-processor.service.worker.ts`)
- **Shared files**: `.shared.ts` suffix (e.g., `types.shared.ts`)

## 🚀 Usage Examples

### In a Svelte Component (Client)
```typescript
<script lang="ts">
  import { CLIENT_ENVIRONMENT, logClient } from '$lib/client/environment';
  import { UserType } from '$lib/shared/types';

  logClient('Component loaded', 'info');
</script>
```

### In a SvelteKit API Route (Server)
```typescript
import { SERVER_ENVIRONMENT, logServer } from '$lib/server/environment';
import { UserType } from '$lib/shared/types';

export async function GET() {
  logServer('API route called', 'info', { user: 'authenticated' });
  // ... implementation
}
```

### In a Worker Script (Worker)
```typescript
import { WORKER_ENVIRONMENT, logWorker } from '$lib/worker/environment';
import { UserType } from '$lib/shared/types';

async function processJob(jobData: any) {
  logWorker('Processing job', 'info', { jobId: jobData.id });
  // ... implementation
}
```

## 🔍 Benefits of This Structure

1. **🔒 Security**: Prevents accidental exposure of sensitive server/worker code to clients
2. **🧹 Clean Imports**: Clear indication of what can be imported where
3. **🚀 Performance**: Better tree-shaking and bundle optimization
4. **🐛 Debugging**: Easier to identify environment-specific issues
5. **👥 Team Collaboration**: Clear boundaries for different developers
6. **📦 Deployment**: Easier to deploy different parts to different environments

## ⚠️ Common Pitfalls

1. **Circular Imports**: Don't create circular dependencies between environments
2. **Mixed Concerns**: Don't mix client, server, and worker logic in shared code
3. **Environment Variables**: Always use the appropriate environment configuration
4. **Type Safety**: Ensure shared types don't reference environment-specific code

## 🧪 Testing

- **Client tests**: Test only client-side functionality
- **Server tests**: Test only server-side functionality
- **Worker tests**: Test only worker functionality
- **Shared tests**: Test only shared utilities and types
- **Integration tests**: Test interactions between environments

## 🔄 Migration Guide

When moving existing code to this structure:

1. **Identify the environment** where the code runs
2. **Move to appropriate directory** (`client/`, `server/`, `worker/`, or `shared/`)
3. **Update imports** to use the new structure
4. **Update environment configuration** to use appropriate environment file
5. **Test thoroughly** to ensure no cross-environment imports
6. **Update documentation** to reflect new structure
