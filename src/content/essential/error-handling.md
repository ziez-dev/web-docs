# Error Handling

ziez provides structured error handling with custom error responses.

## Global Error Handler

```zig
app.on_error(struct {
    fn handler(req: *ziez.Request, res: *ziez.Response, err: anyerror) void {
        const info = ziez.errorToResponse(err);
        const msg = res.error_message orelse info.message;
        res.status(info.code).json(.{
            .statusCode = info.code,
            .@"error" = msg,
        });
    }
}.handler);
```

## Throwing Errors

```zig
return ziez.throw(error.BadRequest, "name is required", res);
```

## Available Errors

`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Teapot`, `UnprocessableEntity`, `TooManyRequests`, `InternalServerError`, `ServiceUnavailable`
