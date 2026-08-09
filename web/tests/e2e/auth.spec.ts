/**
 * E2E tests for authentication flows.
 * Tests login, signup, and password reset pages.
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {
	test.describe('Sign In Page', () => {
		test('should display sign in form', async ({ page }) => {
			await page.goto('/auth/signin');

			// Check page title and heading
			await expect(page).toHaveTitle(/Wayli/);

			// Check form elements exist
			await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
			await expect(page.locator('input[type="password"]')).toBeVisible();
			await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
		});

		test('should show validation errors for empty form', async ({ page }) => {
			await page.goto('/auth/signin');

			// Try to submit empty form
			await page.getByRole('button', { name: /sign in/i }).click();

			// Should show validation message or stay on page
			await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
		});

		test('should have link to sign up page', async ({ page }) => {
			await page.goto('/auth/signin');

			const signUpLink = page.getByRole('link', { name: /sign up|create.*account|register/i });
			await expect(signUpLink).toBeVisible();
		});

		test('should have link to forgot password', async ({ page }) => {
			await page.goto('/auth/signin');

			const forgotLink = page.getByRole('link', { name: /forgot|reset/i });
			await expect(forgotLink).toBeVisible();
		});
	});

	test.describe('Sign Up Page', () => {
		test('should display sign up form', async ({ page }) => {
			await page.goto('/auth/signup');

			// Check form elements exist
			await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
			await expect(page.locator('input[type="password"]').first()).toBeVisible();
			await expect(page.getByRole('button', { name: /sign up|create|register/i })).toBeVisible();
		});

		test('should have link to sign in page', async ({ page }) => {
			await page.goto('/auth/signup');

			const signInLink = page.getByRole('link', { name: /sign in|log in|already.*account/i });
			await expect(signInLink).toBeVisible();
		});
	});

	test.describe('Forgot Password Page', () => {
		test('should display forgot password form', async ({ page }) => {
			await page.goto('/auth/forgot-password');

			// Check form elements exist
			await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
			await expect(page.getByRole('button', { name: /send|reset|submit/i })).toBeVisible();
		});

		test('should have link back to sign in', async ({ page }) => {
			await page.goto('/auth/forgot-password');

			const backLink = page.getByRole('link', { name: /sign in|back|login/i });
			await expect(backLink).toBeVisible();
		});
	});
});

test.describe('Protected Routes', () => {
	// These routes live under the (user) group and are guarded client-side
	// by dashboard/+layout.svelte, which redirects unauthenticated users to signin.
	const protectedRoutes = ['/dashboard', '/dashboard/location-data', '/dashboard/travel'];

	for (const route of protectedRoutes) {
		test(`should redirect to signin when accessing ${route} without auth`, async ({ page }) => {
			await page.goto(route);

			// Should redirect to sign in page
			await expect(page).toHaveURL(/signin/);
		});
	}
});
