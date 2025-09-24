export const ok = (res, data = null, message = 'OK', meta = undefined, status = 200) => {
    const body = { success: true, message };
    if (data !== undefined) body.data = data;
    if (meta !== undefined) body.meta = meta;
    return res.status(status).json(body);
};

export const created = (res, data = null, message = 'Created', meta = undefined) => ok(res, data, message, meta, 201);

export const error = (res, status = 500, message = 'Server Error', type = undefined, details = undefined) => {
    const body = { success: false, message };
    if (type) body.type = type;
    if (details) body.details = details;
    return res.status(status).json(body);
};

// Small guard to normalize express handlers in tests
export const respond = { ok, created, error };
class ApiResponse {
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
    }
}

export { ApiResponse };
