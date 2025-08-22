# 🚀 Semantic Versioning Setup Guide

This document explains how automatic semantic versioning works in the Wayli project and how to use it effectively.

## 📋 Overview

The project now uses [semantic-release](https://semantic-release.gitbook.io/) to automatically:
- Analyze commit messages using [Conventional Commits](https://www.conventionalcommits.org/)
- Determine appropriate version bumps (patch, minor, major)
- Create semantic version tags (e.g., `v1.2.3`)
- Update the CHANGELOG.md file
- Create GitHub releases
- Tag Docker images with semantic versions

## 🔧 How It Works

### 1. Commit Message Analysis
When you push to the `main` branch, the CI pipeline:
- Analyzes all commit messages since the last release
- Determines the highest impact change type
- Bumps the version accordingly

### 2. Version Bump Rules
- **Patch** (`1.0.0` → `1.0.1`): Bug fixes, documentation, style changes
- **Minor** (`1.0.0` → `1.1.0`): New features (backward compatible)
- **Major** (`1.0.0` → `2.0.0`): Breaking changes

### 3. Automatic Actions
- Creates a new git tag (e.g., `v1.2.3`)
- Updates `package.json` version
- Generates/updates `CHANGELOG.md`
- Creates a GitHub release
- Tags Docker images with the new version

## 📝 Commit Message Format

### Basic Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types
| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | Minor |
| `fix` | Bug fix | Patch |
| `docs` | Documentation | Patch |
| `style` | Code style | Patch |
| `refactor` | Code refactoring | Patch |
| `perf` | Performance improvement | Patch |
| `test` | Test changes | Patch |
| `build` | Build system | Patch |
| `ci` | CI/CD changes | Patch |
| `chore` | Maintenance | Patch |
| `revert` | Revert commit | Patch |

### Scopes (Optional)
- `web`: Web application
- `api`: API endpoints
- `db`: Database changes
- `auth`: Authentication
- `ui`: User interface
- `worker`: Background workers
- `docker`: Docker configuration
- `ci`: CI/CD pipeline

### Examples

#### New Feature
```bash
git commit -m "feat(web): add user dashboard with statistics"
```

#### Bug Fix
```bash
git commit -m "fix(auth): resolve login token expiration issue"
```

#### Documentation
```bash
git commit -m "docs: update API documentation with examples"
```

#### Breaking Change
```bash
git commit -m "feat(api): change user endpoint response format

BREAKING CHANGE: The user endpoint now returns user data in a different format.
The 'profile' field has been renamed to 'userProfile' and restructured."
```

## 🚀 Getting Started

### 1. Setup Git Template
Run the setup script to configure git commit message templates:
```bash
./scripts/setup-git-template.sh
```

### 2. Make Your First Semantic Commit
```bash
# Add your changes
git add .

# Commit using the template (opens editor)
git commit

# Or commit directly with conventional format
git commit -m "feat(web): add new feature description"
```

### 3. Push to Main
```bash
git push origin main
```

The CI pipeline will automatically:
- Analyze your commit
- Bump the version if needed
- Create a release
- Tag Docker images

## 🔍 Checking Status

### View Current Version
```bash
npm version
```

### View Git Tags
```bash
git tag --list
```

### View CHANGELOG
```bash
cat CHANGELOG.md
```

## 🐳 Docker Images

After a successful release, Docker images are tagged with:
- `zehbart/wayli:v1.2.3` - Semantic version
- `zehbart/wayli:latest` - Latest stable version
- `zehbart/wayli:abc1234` - Git commit SHA

## 🚨 Important Notes

### 1. Main Branch Only
- Semantic versioning only works on pushes to the `main` branch
- Pull requests and other branches don't trigger releases

### 2. Conventional Commits Required
- Only commits following the conventional format are analyzed
- Other commits are ignored for versioning

### 3. Breaking Changes
- Use `BREAKING CHANGE:` in commit footer for major version bumps
- This is the only way to trigger a major version bump

### 4. No Manual Versioning
- Don't manually update `package.json` version
- Don't manually create git tags
- Let semantic-release handle everything

## 🛠️ Troubleshooting

### Version Not Bumping
- Check commit message format
- Ensure you're pushing to `main` branch
- Check CI pipeline logs for errors

### CI Pipeline Failures
- Verify all required secrets are set
- Check semantic-release configuration
- Review commit message format

### Docker Image Issues
- Ensure Docker Hub credentials are correct
- Check if version was properly extracted
- Verify Docker build context

## 📚 Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [semantic-release Documentation](https://semantic-release.gitbook.io/)
- [Angular Commit Convention](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#-commit-message-format)
- [Keep a Changelog](https://keepachangelog.com/)

## 🤝 Contributing

When contributing to this project:
1. Follow the conventional commit format
2. Use appropriate scopes when possible
3. Write clear, descriptive commit messages
4. Test your changes before committing
5. Let semantic-release handle versioning

---

**Happy coding! 🎉**
