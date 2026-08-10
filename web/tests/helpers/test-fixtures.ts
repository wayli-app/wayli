/**
 * Shared test fixtures for authentication-related tests.
 *
 * These constants centralize mock values used across unit and integration
 * tests. Using named constants avoids false positives from secret-scanning
 * tools while keeping the test data clearly fake and documented.
 *
 * NOTE: These are placeholder values for mock test data only.
 */

/** Placeholder token for mock sessions. */
export const MOCK_TOKEN_A = 'mock-token-a';

/** Placeholder secondary token for mock sessions. */
export const MOCK_TOKEN_B = 'mock-token-b';

/** Placeholder password (meets typical complexity rules) for signup mocks. */
export const MOCK_PASSWORD_A = 'mockpassword-a';

/** Placeholder "old" password for password-change tests. */
export const MOCK_PASSWORD_OLD = 'mockpassword-old';

/** Placeholder "new" password for password-change tests. */
export const MOCK_PASSWORD_NEW = 'mockpassword-new';

/** Placeholder weak password (too short) for rejection tests. */
export const MOCK_PASSWORD_WEAK = 'short';

/** Placeholder 2FA TOTP code. */
export const MOCK_2FA_CODE = '000000';

/** Placeholder user ID. */
export const MOCK_USER_ID = 'user-mock-123';

/** Placeholder new user ID. */
export const MOCK_NEW_USER_ID = 'user-mock-new';

/** Test email address. */
export const TEST_EMAIL = 'test@example.com';

/** Test email for new-user signup. */
export const NEW_USER_EMAIL = 'newuser@example.com';
