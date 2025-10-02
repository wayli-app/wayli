# Wayli 🗺️

[![Build Status](#)](#) [![Coverage Status](#)](#)

Alright, so... Wayli is basically a privacy-first location analysis app. The whole thing is kind of a love letter to people who want to track their travels without selling their soul to big tech.

## What it does

- Tracks your GPS movements and automatically figures out your trips
- Tries to guess your transport mode (car, train, bike, etc.)
- Lets you upload cover photos for trips, and integrates with Unsplash for pretty pictures
- Export everything because YOUR data is YOURS
- Privacy-first: your data, your control

## The vibe-coded stack

- **Frontend**: SvelteKit + TypeScript + Tailwind (because who doesn't love a good component framework)
- **Backend**: Supabase doing the heavy lifting (PostgreSQL, auth, storage, the works)
- **Architecture**: Got this whole layered thing going on - services, stores, API handlers, the full shebang. It's actually pretty well organized... for something mostly vibe-coded

**Fun facts:**
- Actually has test coverage goals (85%+) which is wild for a vibe-coded project
- WCAG 2.1 AA compliant because accessibility matters
- Has this whole service manager architecture with client-safe vs server-only services

The codebase is at `/web` and honestly it's got more structure than you'd expect. Check out the [web README](web/README.md) for the full architecture breakdown.

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
