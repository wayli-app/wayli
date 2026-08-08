<div align="center">
<img src="web/static/logo.svg" alt="Wayli Logo" width="128" height="128">

# Wayli
</div>

[![CI](https://github.com/nimbleflux/wayli/actions/workflows/ci.yml/badge.svg)](https://github.com/nimbleflux/wayli/actions/workflows/ci.yml)
[![Release](https://github.com/nimbleflux/wayli/actions/workflows/release.yml/badge.svg)](https://github.com/nimbleflux/wayli/actions/workflows/release.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Version](https://img.shields.io/github/v/release/nimbleflux/wayli)](https://github.com/nimbleflux/wayli/releases)

<p align="center">
  <a href="https://buymeacoffee.com/nimbleflux" target="_blank" rel="noopener">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="40">
  </a>
</p>

Privacy-first location tracking and trip analysis. Self-hosted, no third-party data sharing.

## Features

- **Trip Detection** - Automatically detects trips from GPS data with transport mode classification
- **Statistics** - Distance traveled, transport modes, and interactive visualizations
- **Data Export** - Export everything in JSON, GeoJSON, or CSV
- **Privacy-First Geocoding** - Uses [Pelias](https://pelias.io), an open-source geocoder, keeping location lookups off commercial services
- **OwnTracks Integration** - Import location data from OwnTracks

## Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-travel-overview.jpg" alt="Travel overview" />
      <br/><sub><b>Travel overview</b> — the "Where I've Been" world map, trip cards, and sticky overview map.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-statistics.jpg" alt="Statistics dashboard" />
      <br/><sub><b>Statistics</b> — interactive maps, transport-mode segments, heatmaps, and activity calendar.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-trip-plan.jpg" alt="Trip planner" />
      <br/><sub><b>Trip planner</b> — day-by-day itineraries with a budget dashboard.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-want-to-visit.jpg" alt="Want-to-visit wishlist" />
      <br/><sub><b>Want-to-visit</b> — a map of places to explore with custom markers and ratings.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-public-profile.jpg" alt="Public profile" />
      <br/><sub><b>Public profile</b> — share your travels with stats, a world map, and a trip grid.</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/images/screenshot-import-export.jpg" alt="Import / Export" />
      <br/><sub><b>Import / Export</b> — bring in GPX, KML, GeoJSON, OwnTracks, and Polarsteps.</sub>
    </td>
  </tr>
</table>

Screenshots are generated from synthetic data — see [`docs/REGENERATING-SCREENSHOTS.md`](docs/REGENERATING-SCREENSHOTS.md) to reproduce them.

## Tech Stack

- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Backend**: [Fluxbase](https://fluxbase.eu) (PostgreSQL, Auth, Storage, Jobs)
- **Geocoding**: Pelias (self-hostable, privacy-preserving)
- **Mapping**: Leaflet

## Quick Start

**Docker Compose:**
```bash
cd deploy/docker-compose
./generate-secrets.sh
# Edit .env with your configuration
docker compose up -d
```

**Kubernetes (Helm):**
```bash
helm install wayli oci://ghcr.io/nimbleflux/charts/wayli -n wayli --create-namespace
```

See the [Deployment Guide](deploy/README.md) for detailed instructions.

## Development

```bash
cd web
npm install
npm run dev
```

See [CLAUDE.md](CLAUDE.md) for development conventions and [web/README.md](web/README.md) for architecture details.

## Privacy

Your location data is sensitive. Wayli is designed to be self-hosted, giving you complete control over your data. All trip data, place visits, and personal information stay on your server.

For geocoding, Wayli uses a hosted [Pelias](https://pelias.io) instance at `pelias.wayli.app` by default (a Wayli-managed server)—coordinates are sent for address lookup but no user information is included and nothing is persisted. You can also self-host Pelias for complete independence.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

AGPL-3.0. See [LICENSE](LICENSE).
