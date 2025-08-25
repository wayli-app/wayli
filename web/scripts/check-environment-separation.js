#!/usr/bin/env node

/**
 * 🔍 Environment Separation Checker
 *
 * This script checks for cross-environment imports to ensure
 * client, server, and worker code remain properly separated.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '..', 'src');

// Environment-specific directories
const ENVIRONMENTS = {
  client: path.join(SRC_DIR, 'client'),
  server: path.join(SRC_DIR, 'server'),
  worker: path.join(SRC_DIR, 'worker'),
  shared: path.join(SRC_DIR, 'shared')
};

// Import patterns that indicate cross-environment violations
const VIOLATION_PATTERNS = [
  // Client importing server/worker
  { from: 'client', to: ['server', 'worker'], pattern: /\$lib\/(server|worker)/ },
  // Server importing client/worker
  { from: 'server', to: ['client', 'worker'], pattern: /\$lib\/(client|worker)/ },
  // Worker importing client/server
  { from: 'worker', to: ['client', 'server'], pattern: /\$lib\/(client|server)/ },
  // Shared importing environment-specific
  { from: 'shared', to: ['client', 'server', 'worker'], pattern: /\$lib\/(client|server|worker)/ }
];

// File extensions to check
const FILE_EXTENSIONS = ['.ts', '.js', '.svelte'];

function findFiles(dir, extensions = []) {
  const files = [];

  if (!fs.existsSync(dir)) return files;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findFiles(fullPath, extensions));
    } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFileForViolations(filePath, environment) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];

  for (const pattern of VIOLATION_PATTERNS) {
    if (pattern.from === environment) {
      const matches = content.match(pattern.pattern);
      if (matches) {
        const forbiddenEnv = matches[1];
        if (pattern.to.includes(forbiddenEnv)) {
          violations.push({
            type: 'cross-environment-import',
            message: `${environment} code importing from ${forbiddenEnv}`,
            match: matches[0],
            line: content.substring(0, content.indexOf(matches[0])).split('\n').length
          });
        }
      }
    }
  }

  return violations;
}

function getEnvironmentFromPath(filePath) {
  for (const [env, envPath] of Object.entries(ENVIRONMENTS)) {
    if (filePath.startsWith(envPath)) {
      return env;
    }
  }
  return 'unknown';
}

function main() {
  console.log('🔍 Checking environment separation...\n');

  let totalViolations = 0;
  let filesChecked = 0;

  for (const [env, envPath] of Object.entries(ENVIRONMENTS)) {
    if (!fs.existsSync(envPath)) {
      console.log(`⚠️  ${env.toUpperCase()} directory not found: ${envPath}`);
      continue;
    }

    console.log(`📁 Checking ${env.toUpperCase()} environment...`);
    const files = findFiles(envPath, FILE_EXTENSIONS);
    let envViolations = 0;

    for (const file of files) {
      const relativePath = path.relative(SRC_DIR, file);
      const violations = checkFileForViolations(file, env);

      if (violations.length > 0) {
        console.log(`  ❌ ${relativePath}:`);
        for (const violation of violations) {
          console.log(`     - ${violation.message} (line ~${violation.line})`);
          console.log(`       Found: ${violation.match}`);
        }
        envViolations += violations.length;
      }

      filesChecked++;
    }

    if (envViolations === 0) {
      console.log(`  ✅ No violations found in ${env} environment`);
    } else {
      console.log(`  ❌ Found ${envViolations} violations in ${env} environment`);
    }

    totalViolations += envViolations;
    console.log('');
  }

  // Summary
  console.log('📊 Summary:');
  console.log(`  Files checked: ${filesChecked}`);
  console.log(`  Total violations: ${totalViolations}`);

  if (totalViolations === 0) {
    console.log('\n🎉 All environments are properly separated!');
    process.exit(0);
  } else {
    console.log('\n❌ Environment separation violations found!');
    console.log('Please fix these violations to maintain proper code separation.');
    process.exit(1);
  }
}

// Run the check
main().catch(error => {
  console.error('❌ Error during environment separation check:', error);
  process.exit(1);
});
