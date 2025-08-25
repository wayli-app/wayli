// 🔄 LIB RE-EXPORTS
// This file provides backward compatibility by re-exporting from the new environment structure
// This allows existing code to continue working while we migrate to the new structure

// Re-export from client environment (for routes and components)
export * from '../client';

// Re-export from shared environment (for types and utilities)
export * from '../shared';
