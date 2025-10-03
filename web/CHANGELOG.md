## [1.2.2](https://github.com/wayli-app/wayli/compare/v1.2.1...v1.2.2) (2025-10-03)


### Bug Fixes

* Rename migrations file. ([80d5d20](https://github.com/wayli-app/wayli/commit/80d5d205711b71d7598b8d229e96f1029a43de5a))

## [1.2.1](https://github.com/wayli-app/wayli/compare/v1.2.0...v1.2.1) (2025-10-03)


### Bug Fixes

* Add ignore statement. ([a4bbbf6](https://github.com/wayli-app/wayli/commit/a4bbbf6c95b3acd5e7ec727dac5049b043fcb574))
* Merge migration SQL files into one. ([6c7c64e](https://github.com/wayli-app/wayli/commit/6c7c64e5ee3b9c0f02f348674cbd896fc328c04a))
* Security issues in SQL. ([f94a26b](https://github.com/wayli-app/wayli/commit/f94a26bb19da20368c07659c5f0d982475620ecb))
* Update RLS when querying jobs table. ([16506be](https://github.com/wayli-app/wayli/commit/16506be39650391178ea2b0219ec10788af20efd))

# [1.2.0](https://github.com/wayli-app/wayli/compare/v1.1.43...v1.2.0) (2025-10-02)


### Bug Fixes

* Fix database warnings. ([d05ad09](https://github.com/wayli-app/wayli/commit/d05ad09cd713a42b5532ff4b8b64c6733c10eaa6))
* Improve transport mode detection. ([a87a690](https://github.com/wayli-app/wayli/commit/a87a69040ba969dc9e49c9b5788092754662c2aa))


### Features

* Implement Supabase Realtime properly. ([1a7e22e](https://github.com/wayli-app/wayli/commit/1a7e22e819382efbf0fda6c524e7f17e628c46f3))
* More docs and fixes. ([740f158](https://github.com/wayli-app/wayli/commit/740f1583a959b5ceb2d29802e8b2b90c77b10a74))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive API service layer with standardized patterns
- Centralized environment configuration system
- Accessibility utilities and ARIA button action
- Comprehensive test coverage framework
- Open source community files (CONTRIBUTING.md, CODE_OF_CONDUCT.md)
- GitHub issue and PR templates
- Performance audit documentation
- Internationalization (i18n) system

### Changed

- Refactored API endpoints to use new base handler patterns
- Updated environment variable handling for better security
- Improved TypeScript strictness across the codebase
- Enhanced accessibility compliance (WCAG 2.1 AA)
- Standardized error handling and response formats

### Fixed

- Environment variable separation between client and server
- Accessibility issues with interactive elements
- TypeScript strict mode compliance
- API response consistency
- Test coverage gaps

### Security

- Prevented client-side access to server-only environment variables
- Enhanced input validation with Zod schemas
- Improved authentication and authorization patterns

## [0.1.0] - 2024-01-XX

### Added

- Initial release of Wayli
- Core location tracking functionality
- Trip management features
- User authentication and profiles
- Statistics and analytics
- Data export capabilities
- Dark mode support
- Two-factor authentication
- Responsive design
- Basic accessibility features

### Features

- **Location Tracking**: Track movements with customizable privacy settings
- **Trip Management**: Organize and plan travels with rich metadata
- **Statistics**: Visualize travel patterns and insights
- **Geocoding**: Automatic location detection and reverse geocoding
- **Data Export**: Export data in multiple formats (JSON, GeoJSON, CSV)
- **Privacy Controls**: Full control over data sharing and retention

### Technical Stack

- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Testing**: Vitest, Testing Library
- **Validation**: Zod
- **Deployment**: Vercel

---

## Version History

### Version Numbering

- **Major** (X.0.0): Breaking changes, major new features
- **Minor** (0.X.0): New features, backward compatible
- **Patch** (0.0.X): Bug fixes, minor improvements

### Release Types

- **Alpha**: Early development, breaking changes expected
- **Beta**: Feature complete, testing phase
- **RC** (Release Candidate): Final testing before stable release
- **Stable**: Production-ready release

## Contributing to the Changelog

When contributing to this project, please update the changelog by:

1. **Adding entries** under the `[Unreleased]` section
2. **Categorizing changes** using the standard categories:
   - `Added` for new features
   - `Changed` for changes in existing functionality
   - `Deprecated` for soon-to-be removed features
   - `Removed` for now removed features
   - `Fixed` for any bug fixes
   - `Security` for security-related changes

3. **Using clear, concise language** that users can understand
4. **Including issue/PR references** when relevant: `(#123)`

### Example Entry

```markdown
### Added

- New user profile page with enhanced settings (#456)
- Support for exporting data in CSV format (#789)

### Fixed

- Resolved issue with location tracking on mobile devices (#123)
- Fixed accessibility issue with modal dialogs (#456)
```

## Links

- [GitHub Releases](https://github.com/your-username/wayli/releases)
- [Project Roadmap](https://github.com/your-username/wayli/projects)
- [Issue Tracker](https://github.com/your-username/wayli/issues)

---

**Note**: This changelog is maintained by the project maintainers. For detailed development history, see the [Git commit log](https://github.com/your-username/wayli/commits/main).
