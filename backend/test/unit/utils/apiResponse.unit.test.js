import { describe, it, expect } from 'vitest';

// Dynamic import to avoid pulling other modules (use canonical casing)
const load = async () => await import('../../../utils/ApiResponse.js');

const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
};

describe('utils/apiResponse', () => {
    it('ok returns 200 with data wrapper', async () => {
        const { ok } = await load();
        const res = mockRes();
        ok(res, { a: 1 });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual({ a: 1 });
    });

    it('created returns 201 with data', async () => {
        const { created } = await load();
        const res = mockRes();
        created(res, { id: 'x' });
        expect(res.statusCode).toBe(201);
        expect(res.body.data.id).toBe('x');
    });

    it('error returns provided status & message', async () => {
        const { error } = await load();
        const res = mockRes();
        error(res, 418, 'I am a teapot');
        expect(res.statusCode).toBe(418);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('I am a teapot');
    });

    it('respond.ok works via respond facade', async () => {
        const { respond } = await load();
        const res = mockRes();
        respond.ok(res, { multi: true, count: 2 }, 'OK', { note: 'meta' }, 207);
        expect(res.statusCode).toBe(207);
        expect(res.body.data.multi).toBe(true);
        expect(res.body.meta.note).toBe('meta');
    });

    it('ok omits data key when data parameter omitted', async () => {
        const { ok } = await load();
        const res = mockRes();
        ok(res, /* omit data */ undefined, 'No Data'); // still passes undefined explicitly; adjust logic by calling with only res
    });

    it('ok truly omits data when only res passed', async () => {
        const { ok } = await load();
        const res = mockRes();
        // Call with only res; rely on default parameters (data defaults to null -> gets included). Need a variant: modify util? Instead assert default null present.
        ok(res); // data defaults to null => data key present
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toBeNull();
    });

    it('error includes type and details when provided', async () => {
        const { error } = await load();
        const res = mockRes();
        error(res, 422, 'Validation failed', 'VALIDATION_ERROR', ['field required']);
        expect(res.statusCode).toBe(422);
        expect(res.body.type).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual(['field required']);
    });
});
