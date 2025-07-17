#!/usr/bin/env node

/**
 * Client/Server Separation Checker
 *
 * This script checks for violations of the client/server separation rules:
 * - Ensures server-only files are not imported in client-side code
 * - Ensures $env/static/private is not imported in client-side code
 * - Validates service adapter usage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// Files that contain server-only code
const SERVER_ONLY_FILES = [
  'src/lib/core/config/server-environment.ts',
  'src/lib/core/supabase/server.ts',
  'src/lib/core/supabase/server-client.ts',
  'src/lib/core/supabase/worker.ts',
  'src/lib/core/supabase/worker-client.ts',
  'src/lib/services/server/server-service-adapter.ts',
  'src/lib/server/auth-middleware.ts'
];

// Server-only services
const SERVER_ONLY_SERVICES = [
  'AuditLoggerService',
  'TripImageSuggestionService',
  'EnhancedPoiDetectionService',
  'EnhancedTripDetectionService',
  'TOTPService',
  'UserProfileService',
  'TripLocationsService',
  'DatabaseMigrationService',
  'PexelsService',
  'ImageGenerationProcessorService',
  'ExportService',
  'ExportProcessorService'
];

// Client-side file patterns
const CLIENT_FILE_PATTERNS = [
  /\.svelte$/,
  /\/stores\//,
  /\/components\//,
  /service-layer-adapter\.ts$/
];

// Server-side file patterns (for future use)
// const SERVER_FILE_PATTERNS = [
// 	/\+server\.ts$/,
// 	/\+page\.server\.ts$/,
// 	/\+layout\.server\.ts$/,
// 	/hooks\.server\.ts$/,
// 	/\/server\//,
// 	/server-service-adapter\.ts$/,
// 	/server-environment\.ts$/,
// 	/worker-environment\.ts$/,
// 	/worker-client\.ts$/,
// 	/server-client\.ts$/,
// 	/server\.ts$/
// ];

function isClientFile(filePath) {
  return CLIENT_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

// function isServerFile(filePath) {
// 	return SERVER_FILE_PATTERNS.some(pattern => pattern.test(filePath));
// }

function findFiles(dir, patterns = [/\.ts$/, /\.svelte$/], excludePatterns = [/node_modules/, /\.git/]) {
  const files = [];

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!excludePatterns.some(pattern => pattern.test(fullPath))) {
          traverse(fullPath);
        }
      } else if (patterns.some(pattern => pattern.test(fullPath))) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

function checkFileForViolations(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];

  // Check for imports of server-only files
  for (const serverFile of SERVER_ONLY_FILES) {
    const importPattern = new RegExp(`import.*['"]\\$lib/${serverFile.replace('src/lib/', '')}['"]`, 'g');
    const matches = content.match(importPattern);
    if (matches) {
      violations.push({
        type: 'server-only-import',
        message: `Import of server-only file: ${serverFile}`,
        matches
      });
    }
  }

  	// Check for imports of $env/static/private in client files only
	if (isClientFile(filePath)) {
		const privateEnvPattern = /import.*\$env\/static\/private/g;
		const privateMatches = content.match(privateEnvPattern);
		if (privateMatches) {
			violations.push({
				type: 'private-env-import',
				message: 'Import of $env/static/private in client-side code',
				matches: privateMatches
			});
		}
	}

  // Check for usage of server-only services in client files
  if (isClientFile(filePath)) {
    for (const service of SERVER_ONLY_SERVICES) {
      const servicePattern = new RegExp(`\\b${service}\\b`, 'g');
      const matches = content.match(servicePattern);
      if (matches) {
        violations.push({
          type: 'server-service-usage',
          message: `Usage of server-only service: ${service}`,
          matches
        });
      }
    }
  }

  return violations;
}

function main() {
  console.log('🔍 Checking client/server separation...\n');

  const allFiles = findFiles(SRC_DIR);
  let totalViolations = 0;
  let filesWithViolations = 0;

  for (const file of allFiles) {
    const relativePath = path.relative(PROJECT_ROOT, file);
    const violations = checkFileForViolations(file);

    if (violations.length > 0) {
      filesWithViolations++;
      totalViolations += violations.length;

      console.log(`❌ ${relativePath}`);
      for (const violation of violations) {
        console.log(`   ${violation.type}: ${violation.message}`);
      }
      console.log('');
    }
  }

  if (totalViolations === 0) {
    console.log('✅ No client/server separation violations found!');
    process.exit(0);
  } else {
    console.log(`❌ Found ${totalViolations} violations in ${filesWithViolations} files`);
    console.log('\n💡 Tips:');
    console.log('- Move server-only code to server/ directories');
    console.log('- Use appropriate service adapters');
    console.log('- Check import paths for server-only files');
    console.log('- Ensure $env/static/private is only used in server code');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}