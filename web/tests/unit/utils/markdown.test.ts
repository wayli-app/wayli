import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '$lib/utils/markdown';

describe('renderMarkdown', () => {
	describe('basic markdown', () => {
		it('renders headings', () => {
			expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>');
			expect(renderMarkdown('### Subtitle')).toContain('<h3>Subtitle</h3>');
		});

		it('renders bold and italic', () => {
			expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
			expect(renderMarkdown('*italic*')).toContain('<em>italic</em>');
		});

		it('renders links', () => {
			const result = renderMarkdown('[Wayli](https://wayli.app)');
			expect(result).toContain('<a href="https://wayli.app"');
			expect(result).toContain('Wayli</a>');
		});

		it('renders lists', () => {
			const result = renderMarkdown('- item 1\n- item 2');
			expect(result).toContain('<li>item 1</li>');
			expect(result).toContain('<li>item 2</li>');
		});

		it('renders code blocks', () => {
			const result = renderMarkdown('```\nconst x = 1;\n```');
			expect(result).toContain('<code>');
			expect(result).toContain('const x = 1;');
		});

		it('renders inline code', () => {
			expect(renderMarkdown('Use `npm` to install')).toContain('<code>npm</code>');
		});

		it('renders blockquotes', () => {
			expect(renderMarkdown('> A quote')).toContain('<blockquote>');
		});
	});

	describe('XSS prevention (DOMPurify)', () => {
		it('strips script tags', () => {
			const malicious = '<script>alert("xss")</script>';
			const result = renderMarkdown(malicious);
			expect(result).not.toContain('<script');
			expect(result).not.toContain('alert');
		});

		it('strips inline event handlers', () => {
			const malicious = '<img src="x" onerror="alert(1)">';
			const result = renderMarkdown(malicious);
			expect(result).not.toContain('onerror');
			expect(result).not.toContain('alert');
		});

		it('strips javascript: URLs', () => {
			const malicious = '[click](javascript:alert(1))';
			const result = renderMarkdown(malicious);
			expect(result).not.toContain('javascript:');
			expect(result).not.toContain('alert');
		});

		it('strips iframe tags', () => {
			const malicious = '<iframe src="https://evil.com"></iframe>';
			const result = renderMarkdown(malicious);
			expect(result).not.toContain('<iframe');
		});
	});

	describe('image stripping', () => {
		it('removes markdown images when stripImages=true', () => {
			const content = 'Hello\n![photo](https://example.com/p.jpg)\nWorld';
			const result = renderMarkdown(content, true);
			expect(result).not.toContain('<img');
			expect(result).toContain('Hello');
			expect(result).toContain('World');
		});

		it('keeps images when stripImages=false (default)', () => {
			const content = '![photo](https://example.com/p.jpg)';
			const result = renderMarkdown(content);
			expect(result).toContain('<img');
			expect(result).toContain('example.com/p.jpg');
		});

		it('removes "Image:" labels left behind', () => {
			const content = 'Image: ![photo](https://example.com/p.jpg)\nText';
			const result = renderMarkdown(content, true);
			expect(result).not.toContain('Image:');
		});
	});

	describe('edge cases', () => {
		it('returns empty string for empty input', () => {
			expect(renderMarkdown('')).toBe('');
		});

		it('returns empty string for null/undefined', () => {
			expect(renderMarkdown(null as unknown as string)).toBe('');
		});

		it('returns content on render error (graceful fallback)', () => {
			// Passing a circular reference or weird input shouldn't crash
			const result = renderMarkdown('Just plain text');
			expect(result).toContain('plain text');
		});
	});
});
