# Docker Compose Deployment for Wayli

This directory contains Docker Compose configuration files for deploying Wayli along with Supabase as the backend.

## Prerequisites

- Docker Engine 20.10 or later
- Docker Compose v2.0 or later
- At least 4GB of available RAM
- 10GB of free disk space

## Quick Start

> **Note:** Deployment manifests for Wayli and Supabase will be added in the next phase. This README will be updated with complete deployment instructions once the configuration files are in place.

### 1. Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit the `.env` file and set the required environment variables (see Configuration section below).

### 2. Deploy

Start all services:

```bash
docker-compose up -d
```

Check service status:

```bash
docker-compose ps
```

View logs:

```bash
docker-compose logs -f wayli
```

### 3. Access

Once deployed, access Wayli at:
- **Application**: http://localhost:3000
- **Supabase Studio**: http://localhost:8000

## Configuration

The following environment variables need to be configured in your `.env` file:

### Wayli Configuration

```env
# Wayli version (automatically updated after each release)
WAYLI_VERSION=latest

# Application environment
NODE_ENV=production
```

### Supabase Configuration

```env
# Database
POSTGRES_PASSWORD=your-secure-password

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-jwt-secret

# API Keys (generate with Supabase)
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Site Configuration
SITE_URL=http://localhost:3000
API_EXTERNAL_URL=http://localhost:8000
```

See `.env.example` for a complete list of configuration options.

## Services

The Docker Compose stack includes:

- **Wayli Web**: Main application frontend
- **Wayli Worker**: Background job processor
- **Supabase**: Complete backend stack including:
  - PostgreSQL database
  - Authentication service
  - Storage service
  - Realtime subscriptions
  - REST API
  - Studio (admin UI)

## Updating

To update to a new version of Wayli:

1. Edit `.env` and update `WAYLI_VERSION` to the desired version
2. Pull the new images: `docker-compose pull`
3. Restart services: `docker-compose up -d`

Version tags follow semantic versioning (e.g., `v0.0.1`). Available versions can be found at:
- [GitHub Releases](https://github.com/wayli-app/wayli/releases)
- [Docker Hub](https://hub.docker.com/r/zehbart/wayli/tags)

## Data Persistence

All data is persisted in Docker volumes:
- `wayli_db_data`: PostgreSQL database
- `wayli_storage`: File storage

To backup your data:

```bash
# Backup database
docker-compose exec db pg_dump -U postgres > backup.sql

# Backup storage
docker-compose exec storage tar czf /tmp/storage-backup.tar.gz /var/lib/storage
docker cp $(docker-compose ps -q storage):/tmp/storage-backup.tar.gz ./storage-backup.tar.gz
```

## Troubleshooting

### Services won't start

Check logs for specific errors:
```bash
docker-compose logs
```

### Port conflicts

If ports 3000 or 8000 are already in use, edit `docker-compose.yml` to change the port mappings.

### Database connection issues

Ensure PostgreSQL is fully initialized before starting Wayli:
```bash
docker-compose up -d db
# Wait 30 seconds
docker-compose up -d
```

## Support

For issues and questions:
- [GitHub Issues](https://github.com/wayli-app/wayli/issues)
- [Documentation](https://github.com/wayli-app/wayli)

## License

Wayli is licensed under the MIT License. See [LICENSE](../../LICENSE) for details.
