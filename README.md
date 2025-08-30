# Wayli

[![Build Status](#)](#) [![Coverage Status](#)](#)

Wayli is an open source geospatial tracking and trip analysis platform. It helps users visualize, analyze, and manage their location data, trips, and points of interest.

## Features
- Visualize GPS tracks and trips on an interactive map
- Automatic trip detection and statistics
- POI visit detection (15+ min stay)
- Modes of transport detection (car, train, cycling, etc.)
- Upload and manage cover photos for trips
- Unsplash integration for trip photos
- User profile with home address for improved trip detection
- Privacy-first: your data, your control

## Quick Start
```bash
git clone https://github.com/wayli-app/wayli.git
cd wayli/web
npm install
npm run dev
```

## 🚀 Semantic Versioning

This project uses automatic semantic versioning based on [Conventional Commits](https://www.conventionalcommits.org/). The CI pipeline automatically:

- Analyzes commit messages to determine version bumps
- Creates semantic version tags (e.g., `v1.2.3`)
- Updates the CHANGELOG.md file
- Creates GitHub releases
- Tags Docker images with semantic versions

### 📝 Commit Message Format

Follow this format for your commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types:
- `feat`: New feature (minor version bump)
- `fix`: Bug fix (patch version bump)
- `docs`: Documentation changes (patch version bump)
- `style`: Code style changes (patch version bump)
- `refactor`: Code refactoring (patch version bump)
- `perf`: Performance improvements (patch version bump)
- `test`: Test changes (patch version bump)
- `build`: Build system changes (patch version bump)
- `ci`: CI/CD changes (patch version bump)
- `chore`: Maintenance tasks (patch version bump)
- `revert`: Revert previous commit (patch version bump)

#### Scopes:
- `web`: Web application
- `api`: API endpoints
- `db`: Database changes
- `auth`: Authentication related
- `ui`: User interface
- `worker`: Background workers
- `docker`: Docker configuration
- `ci`: CI/CD pipeline

#### Examples:
```bash
git commit -m "feat(web): add user dashboard"
git commit -m "fix(auth): resolve login token expiration issue"
git commit -m "docs(api): update API documentation"
git commit -m "ci: add semantic versioning workflow"
```

#### Breaking Changes:
Use `BREAKING CHANGE:` in the footer for major version bumps:
```bash
git commit -m "feat(api): change user endpoint response format

BREAKING CHANGE: The user endpoint now returns user data in a different format."
```

### 🔄 Version Bumps

- **Patch** (`1.0.0` → `1.0.1`): Bug fixes, documentation, style changes
- **Minor** (`1.0.0` → `1.1.0`): New features (backward compatible)
- **Major** (`1.0.0` → `2.0.0`): Breaking changes

### 🐳 Docker Images

Docker images are automatically tagged with:
- `zehbart/wayli:v1.2.3` - Semantic version
- `zehbart/wayli:latest` - Latest stable version
- `zehbart/wayli:abc1234` - Git commit SHA

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute, file issues, and submit pull requests.

## License
Wayli is licensed under the MIT License. See [LICENSE](LICENSE) for details.