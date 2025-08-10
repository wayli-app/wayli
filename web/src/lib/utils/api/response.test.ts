// web/src/lib/utils/api/response.test.ts
import { describe, it, expect } from 'vitest';
import { successResponse, errorResponse, validationErrorResponse, notFoundResponse, conflictResponse, serverErrorResponse } from './response';

async function readJson(res: Response) {
  const text = await res.text();
  return JSON.parse(text);
}

describe('api/response', () => {
  it('successResponse wraps data and meta with timestamp', async () => {
    const res = successResponse({ ok: true }, 201, { req: 'id' });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ ok: true });
    expect(body.meta.timestamp).toBeTruthy();
    expect(body.meta.req).toBe('id');
  });

  it('errorResponse from string produces UNKNOWN_ERROR code', async () => {
    const res = errorResponse('Boom', 418);
    expect(res.status).toBe(418);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Boom');
    expect(body.error.code).toBe('UNKNOWN_ERROR');
  });

  it('validationErrorResponse uses VALIDATION_ERROR and 400', async () => {
    const res = validationErrorResponse('Invalid', { field: 'x' });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid');
    expect(body.error.details.field).toBe('x');
  });

  it('notFoundResponse returns 404', async () => {
    const res = notFoundResponse('Nope');
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error.code).toBe('NOT_FOUND_ERROR');
    expect(body.error.message).toBe('Nope');
  });

  it('conflictResponse returns 409 with details', async () => {
    const res = conflictResponse('Conflict', { key: 'value' });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error.code).toBe('CONFLICT_ERROR');
    expect(body.error.details.key).toBe('value');
  });

  it('serverErrorResponse returns 500', async () => {
    const res = serverErrorResponse('Oops', { why: 'x' });
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('Oops');
  });
});

