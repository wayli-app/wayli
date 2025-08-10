// web/src/lib/utils/errors/error-handler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BaseError, ValidationError, NotFoundError, handleError, logError, isOperationalError } from './error-handler';

describe('error-handler', () => {
  it('wraps unknown Error into BaseError', () => {
    const err = new Error('boom');
    const app = handleError(err);
    expect(app.code).toBe('UNKNOWN_ERROR');
    expect(app.statusCode).toBe(500);
    expect(isOperationalError(app)).toBe(false);
  });

  it('keeps BaseError unchanged', () => {
    const app = new ValidationError('bad', { field: 'x' });
    const res = handleError(app);
    expect(res).toBe(app);
    expect(isOperationalError(res)).toBe(true);
  });

  it('logError uses correct severity by status code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const op = new ValidationError('bad');
    logError(op);
    expect(warn).toHaveBeenCalled();
    const nf = new NotFoundError('missing');
    logError(nf);
    expect(warn).toHaveBeenCalled();
    const crit = new BaseError('oops', 'X', 500, false);
    logError(crit);
    expect(error).toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });
});

