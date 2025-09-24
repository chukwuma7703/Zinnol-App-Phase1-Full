import { describe, it, expect, beforeEach, vi } from 'vitest';
import Joi from 'joi';

// Helper to get the real validate (bypassing smoke moduleNameMapper for validationMiddleware)
const loadRealValidate = () => {
    let realValidate;
    vi.resetModules();
    vi.doMock('../../../middleware/validationMiddleware.js', () => ({
        __esModule: true,
        ...vi.importActual('../../../middleware/validationMiddleware.js'),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    realValidate = require('../../../middleware/validationMiddleware.js').validate;
    return realValidate;
};

const next = vi.fn();

const makeReqRes = () => ({
    req: { body: {}, params: {}, query: {}, get: vi.fn() },
    res: { setHeader: vi.fn(), statusCode: 200 }
});

describe('middleware/validationMiddleware.validate', () => {
    beforeEach(() => vi.clearAllMocks());

    it('passes and strips unknown + converts types', () => {
        const validate = loadRealValidate();
        const schema = Joi.object({
            a: Joi.number().integer().required(),
            b: Joi.boolean().required(),
        });
        const { req, res } = makeReqRes();
        req.body = { a: '42', b: 'true', extra: 'x' };
        const mw = validate(schema, 'body');
        mw(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.body).toEqual({ a: 42, b: true }); // stripped extra and converted
    });

    it('returns ValidationError via next with details on failure', () => {
        const validate = loadRealValidate();
        const schema = Joi.object({ a: Joi.string().min(3).required() });
        const { req, res } = makeReqRes();
        req.body = { a: 'x' }; // too short
        const mw = validate(schema, 'body');
        mw(req, res, (err) => {
            expect(err).toBeTruthy();
            expect(err.statusCode).toBe(400);
            expect(err.type).toBe('VALIDATION_ERROR');
            expect(Array.isArray(err.details)).toBe(true);
            expect(err.details[0]).toHaveProperty('field');
            expect(err.details[0]).toHaveProperty('message');
        });
    });

    it('validates params and assigns cleaned value', () => {
        const validate = loadRealValidate();
        const schema = Joi.object({ id: Joi.string().length(24).required() });
        const { req, res } = makeReqRes();
        req.params = { id: '507f1f77bcf86cd799439011' };
        const mw = validate(schema, 'params');
        mw(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.params).toEqual({ id: '507f1f77bcf86cd799439011' });
    });

    it('applies query defaults and conversion', () => {
        const validate = loadRealValidate();
        const schema = Joi.object({ page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(10) });
        const { req, res } = makeReqRes();
        req.query = { page: '2' }; // limit missing -> default; page string -> converted
        const mw = validate(schema, 'query');
        mw(req, res, next);
        expect(req.query).toEqual({ page: 2, limit: 10 });
    });
});
