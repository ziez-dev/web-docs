# Error Handling

Imagine a factory assembly line. Most of the time, products flow smoothly from start to finish. But when something goes wrong -- a missing part, a defective component, a machine jam -- there is an emergency button that stops the line and calls a supervisor. In ziez, error handling works the same way: when something goes wrong in a handler, you "press the button" by returning an error, and ziez calls a supervisor (the error handler) to decide what to tell the client.

## Zig Error Unions and HTTP Status

Handler functions in ziez return `anyerror!void` -- a Zig error union. This means a handler can either succeed normally or return an error. When an error is returned, ziez's router catches it, maps it to an appropriate HTTP status code, and sends a response.

There are two ways to return an error from a handler:

**1. Return a bare error (default message):**

```zig
return error.NotFound;
```

This sends a response with the default message `"Not Found"` and status code `404`.

**2. Use `ziez.throw()` for a custom message:**

```zig
return ziez.throw(error.BadRequest, "email is required", res);
```

This attaches a custom message to the response before returning the error. The router reads this message and uses it instead of the default.

## Throwing Errors

The `ziez.throw()` function is the primary way to return HTTP errors with custom messages from route handlers:

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.post("/users", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const Input = struct { name: []const u8, email: []const u8 };
            const input = req.body_json(Input) orelse
                return ziez.throw(error.BadRequest, "name and email are required", res);

            if (input.name.len == 0)
                return ziez.throw(error.BadRequest, "name cannot be empty", res);

            if (std.mem.indexOfScalar(u8, input.email, '@') == null)
                return ziez.throw(error.UnprocessableEntity, "invalid email format", res);

            res.status(201).json(.{
                .name = input.name,
                .email = input.email,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

```bash
# Missing body
curl -X POST http://localhost:3000/users
# {"statusCode":400,"error":"name and email are required"}

# Invalid email
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"not-an-email"}'
# {"statusCode":422,"error":"invalid email format"}
```

## Custom Global Error Handler

By default, ziez sends a JSON response with `{ "statusCode": ..., "error": ... }`. You can override this behavior globally with `app.on_error()`, which registers a custom function that handles every error.

Think of this as assigning your own supervisor to the factory floor -- instead of the default alarm, you get to decide exactly what happens when an error occurs.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Register a custom error handler
    app.on_error(struct {
        fn handler(req: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            const msg = res.error_message orelse info.message;

            // Custom error response format
            res.status(info.code).json(.{
                .success = false,
                .@"error" = .{
                    .code = info.code,
                    .message = msg,
                    .type = @errorName(err),
                },
                .requestId = req.request_id,
                .path = req.path,
            });
        }
    }.handler);

    app.get("/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id = req.param("id") orelse return error.BadRequest;

            if (std.mem.eql(u8, id, "0"))
                return ziez.throw(error.BadRequest, "user ID cannot be zero", res);

            if (std.mem.eql(u8, id, "999"))
                return error.NotFound;

            res.json(.{ .id = id, .name = "Alice" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

```bash
# Custom error with message
curl http://localhost:3000/users/0
# {
#   "success": false,
#   "error": { "code": 400, "message": "user ID cannot be zero", "type": "BadRequest" },
#   "requestId": "a1b2c3",
#   "path": "/users/0"
# }

# Bare error (default message)
curl http://localhost:3000/users/999
# {
#   "success": false,
#   "error": { "code": 404, "message": "Not Found", "type": "NotFound" },
#   "requestId": "d4e5f6",
#   "path": "/users/999"
# }
```

The custom error handler receives three arguments:
- `req` -- the request that caused the error
- `res` -- the response (use `res.error_message` to get the custom message from `ziez.throw()`)
- `err` -- the Zig error value (use `ziez.errorToResponse(err)` to map it to a status code and default message)

## HTTP Error Reference

ziez maps every error to an HTTP status code and a default message. Here is the complete list:

### Client Errors (4xx)

| Error Name                      | Status | Default Message                    |
|---------------------------------|--------|------------------------------------|
| `BadRequest`                    | 400    | Bad Request                        |
| `Unauthorized`                  | 401    | Unauthorized                       |
| `PaymentRequired`               | 402    | Payment Required                   |
| `Forbidden`                     | 403    | Forbidden                          |
| `NotFound`                      | 404    | Not Found                          |
| `MethodNotAllowed`              | 405    | Method Not Allowed                 |
| `NotAcceptable`                 | 406    | Not Acceptable                     |
| `RequestTimeout`                | 408    | Request Timeout                    |
| `Conflict`                      | 409    | Conflict                           |
| `Gone`                          | 410    | Gone                               |
| `LengthRequired`                | 411    | Length Required                    |
| `PreconditionFailed`            | 412    | Precondition Failed                |
| `PayloadTooLarge`               | 413    | Content Too Large                  |
| `URITooLong`                    | 414    | URI Too Long                       |
| `UnsupportedMediaType`          | 415    | Unsupported Media Type             |
| `RangeNotSatisfiable`           | 416    | Range Not Satisfiable              |
| `ExpectationFailed`             | 417    | Expectation Failed                 |
| `Teapot`                        | 418    | I'm a teapot                       |
| `UnprocessableEntity`           | 422    | Unprocessable Content              |
| `TooEarly`                      | 425    | Too Early                          |
| `UpgradeRequired`               | 426    | Upgrade Required                   |
| `PreconditionRequired`          | 428    | Precondition Required              |
| `TooManyRequests`               | 429    | Too Many Requests                  |
| `RequestHeaderFieldsTooLarge`   | 431    | Request Header Fields Too Large    |
| `UnavailableForLegalReasons`    | 451    | Unavailable For Legal Reasons      |

### Server Errors (5xx)

| Error Name                      | Status | Default Message                    |
|---------------------------------|--------|------------------------------------|
| `InternalServerError`           | 500    | Internal Server Error              |
| `NotImplemented`                | 501    | Not Implemented                    |
| `BadGateway`                    | 502    | Bad Gateway                        |
| `ServiceUnavailable`            | 503    | Service Unavailable                |
| `GatewayTimeout`                | 504    | Gateway Timeout                    |
| `HTTPVersionNotSupported`       | 505    | HTTP Version Not Supported         |

Any error not in this list is mapped to `500 Internal Server Error`.

## Common Patterns

### Validation Errors

Return `error.BadRequest` or `error.UnprocessableEntity` with a descriptive message when input validation fails.

```zig
app.post("/register", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const Input = struct { email: []const u8, password: []const u8 };
        const input = req.body_json(Input) orelse
            return ziez.throw(error.BadRequest, "JSON body with email and password required", res);

        if (input.password.len < 8)
            return ziez.throw(error.BadRequest, "password must be at least 8 characters", res);

        if (std.mem.indexOfScalar(u8, input.email, '@') == null)
            return ziez.throw(error.UnprocessableEntity, "invalid email format", res);

        res.status(201).json(.{ .registered = true });
    }
}.handler);
```

### Resource Not Found

Return `error.NotFound` when a requested resource does not exist.

```zig
app.get("/posts/:id", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const id_str = req.param("id") orelse return error.BadRequest;
        const id = std.fmt.parseInt(u32, id_str, 10) catch
            return ziez.throw(error.BadRequest, "post ID must be a number", res);

        // Simulate a database lookup
        if (id > 100) {
            return ziez.throw(error.NotFound, "post not found", res);
        }

        res.json(.{ .id = id, .title = "Sample Post" });
    }
}.handler);
```

### Authentication and Authorization

Use `error.Unauthorized` when credentials are missing or invalid, and `error.Forbidden` when the user is authenticated but lacks permission.

```zig
// Unauthorized — who are you?
if (req.header("authorization") == null)
    return ziez.throw(error.Unauthorized, "authentication required", res);

// Forbidden — you cannot do this
if (!user.is_admin)
    return ziez.throw(error.Forbidden, "admin access required", res);
```

## Default Behavior Without Custom Handler

If you do not register a custom error handler with `app.on_error()`, ziez uses a built-in default:

```json
{
    "statusCode": 404,
    "error": "Not Found"
}
```

The default handler calls `ziez.errorToResponse(err)` to get the status code and message, uses `res.error_message` if it was set by `ziez.throw()`, and sends a JSON response. Server errors (5xx) are automatically logged at the `error` level.
