# Interceptors

Comptime per-route middleware chains with zero runtime overhead.

If middleware is a **runtime security guard** (checking IDs at the door as people arrive), interceptors are **comptime security blueprints** (the entire security layout is designed into the building from the start). Each layer in the chain is determined at compile time, so there is zero runtime dispatch overhead -- the compiler inlines the entire call chain into a single function.

---

## Interceptors vs Middleware

Ziez has both middleware and interceptors. They serve different purposes:

| Aspect | Middleware | Interceptors |
|---|---|---|
| When resolved | Runtime | Compile time (comptime) |
| Scope | Global (`app.use`) or route-level | Per-route (`ziez.intercept`) |
| Dispatch | Dynamic -- `next.call()` jumps to the next function at runtime | Inlined -- the compiler generates one flat function |
| Overhead | One function pointer call per middleware | Zero -- everything is inlined |
| When to use | Cross-cutting concerns (logging, CORS, compression) that apply to many routes | Fixed per-route chains (auth + logging for a specific endpoint) |

Use **middleware** for concerns that span many routes. Use **interceptors** when you need a specific, type-safe chain of pre-checks on a particular route and want the compiler to optimize it.

---

## `ziez.intercept` -- Build a Comptime Middleware Chain

`ziez.intercept` takes a tuple of middleware functions and a handler, then builds the entire chain at compile time. The middlewares wrap the handler outer-to-inner: the first middleware in the tuple is the outermost layer.

### Signature

```zig
ziez.intercept(.{mw1, mw2, mw3}, handler)
```

- `mw1`, `mw2`, `mw3` -- functions with signature `fn(*ziez.Request, *ziez.Response, *ziez.Next) void`
- `handler` -- function with signature `fn(*ziez.Request, *ziez.Response) anyerror!void`

### How wrapping works

Given `ziez.intercept(.{A, B}, handler)`:

```
Request arrives
    |
    v
  A runs first (outermost)
    |
    v
  B runs second
    |
    v
  handler runs last (innermost)
```

The middlewares are applied outer-to-inner. The first middleware in the tuple receives the request first.

### Example

```zig
const std = @import("std");
const ziez = @import("ziez");

fn loggingInterceptor(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
    std.debug.print("[LOG] {s} {s}\n", .{ @tagName(req.method), req.path });
    next.call();
}

fn authInterceptor(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
    const token = req.header("authorization") orelse {
        res.status(401).json(.{ .@"error" = "missing token" });
        return;
    };
    if (token.len == 0) {
        res.status(401).json(.{ .@"error" = "empty token" });
        return;
    }
    next.call();
}

pub fn main() !void {
    const allocator = std.heap.smp_allocator;
    var app = ziez.init(allocator);
    defer app.deinit();

    // The intercept chain: logging runs first, then auth, then the handler
    app.get("/data", ziez.intercept(.{
        loggingInterceptor,
        authInterceptor,
    }, struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .data = "secret" });
        }
    }.handler));

    try app.listen("0.0.0.0:3000");
}
```

```bash
# No token -- auth interceptor rejects before handler runs
curl http://localhost:3000/data
# {"error":"missing token"}

# With token -- both interceptors pass, handler runs
curl -H "Authorization: Bearer mytoken" http://localhost:3000/data
# {"data":"secret"}
```

### Key behavior

- **No `next.call()` needed in interceptors** -- unlike global middleware, the compiler inlines the calls. You only call `next.call()` in the interceptor functions themselves (if you want the chain to continue).
- **Early rejection** -- if an interceptor sends a response without calling `next.call()`, the inner layers and handler never run. This is how you short-circuit on auth failures.
- **Zero overhead** -- because the chain is resolved at compile time, there is no runtime dispatch table. The compiler sees the entire chain as one function.

---

## `ziez.serialized` -- Automatic Response Serialization

`ziez.serialized` is a special interceptor that changes the handler signature. Instead of taking `(req, res)` and calling `res.json()` yourself, your handler only takes `*ziez.Request` and **returns a value**. The interceptor serializes the return value using a `SerializerConfig` and sends the JSON response automatically.

### Signature

```zig
ziez.serialized(SerializerConfig, handler)
```

- `SerializerConfig` -- a serialization config that controls which fields are included, excluded, transformed, etc. (see the Serialization pattern)
- `handler` -- function with signature `fn(*ziez.Request) anyerror!T`, where `T` is any struct type

### Why use it

- **Cleaner handlers** -- your handler focuses purely on data, not response plumbing
- **Consistent serialization** -- the same config ensures the same field filtering across all endpoints that use it
- **Less boilerplate** -- no `res.json(...)` calls, no manual content-type headers

### Example

```zig
const std = @import("std");
const ziez = @import("ziez");

const User = struct {
    id: i64,
    name: []const u8,
    password: []const u8,  // secret -- should never be in responses
};

// Serializer config: exclude the password field
const PublicUserConfig = ziez.SerializerConfig(User){
    .exclude = &.{"password"},
};

pub fn main() !void {
    const allocator = std.heap.smp_allocator;
    var app = ziez.init(allocator);
    defer app.deinit();

    app.on_error(struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            const msg = res.error_message orelse info.message;
            res.status(info.code).json(.{ .statusCode = info.code, .@"error" = msg });
        }
    }.handler);

    // The handler only returns data -- serialization is automatic
    app.get("/me", ziez.serialized(PublicUserConfig, struct {
        fn handler(_: *ziez.Request) anyerror!User {
            return User{
                .id = 1,
                .name = "Alice",
                .password = "secret123",
            };
        }
    }.handler));

    try app.listen("0.0.0.0:3000");
}
```

```bash
curl http://localhost:3000/me
# {"id":1,"name":"Alice"}
# Note: "password" is excluded by the config
```

### Under the hood

The `serialized` interceptor:

1. Calls your handler, which returns a value of type `T`
2. Runs `ziez.serialize(allocator, data, config)` to produce a JSON string
3. Sets `Content-Type: application/json`
4. Sends the response body

If serialization fails, it responds with `500` and `{"error":"serialization failed"}`.

---

## Combining Interceptors with Pipes

Interceptors and validation pipes compose naturally. You can wrap a pipe-enhanced handler with interceptors:

```zig
const CreateUser = struct {
    name: []const u8,
    email: []const u8,
    pub const rules = .{
        .name = ziez.schema.StringRule{ .min_length = 2 },
        .email = ziez.schema.StringRule{ .format = .email },
    };
};

// Logging interceptor wraps the validation pipe, which wraps the handler
app.post("/users", ziez.intercept(.{
    loggingInterceptor,
}, ziez.validateBodySchema(CreateUser, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, user: CreateUser) !void {
        res.status(201).json(.{ .id = 1, .name = user.name, .email = user.email });
    }
}.handler)));
```

The execution order is:

```
Request
  -> loggingInterceptor
    -> validateBodySchema (parses JSON, validates rules)
      -> handler (only runs if body is valid)
```

---

## Decision Guide

```
Need per-route fixed middleware chain with zero overhead?
  -> Use ziez.intercept(.{...}, handler)

Want handler to just return data, not manage responses?
  -> Use ziez.serialized(config, handler)

Need cross-cutting concern (logging, CORS, compression) on many routes?
  -> Use app.use(middleware)

Need validation on body/params/query?
  -> Use validation pipes (paramInt, validateBodySchema, etc.)

Need both validation and a middleware chain on one route?
  -> Combine intercept + pipes (see above)
```

---

## Complete Example

```zig
const std = @import("std");
const ziez = @import("ziez");

// -- Domain types --

const User = struct {
    id: i64,
    name: []const u8,
    role: []const u8,
    password_hash: []const u8,
};

const PublicUserConfig = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
};

// -- Interceptors --

fn loggingInterceptor(req: *ziez.Request, _: *ziez.Response, next: *ziez.Next) void {
    std.debug.print("[LOG] {s} {s}\n", .{ @tagName(req.method), req.path });
    next.call();
}

fn authInterceptor(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
    const token = req.header("authorization") orelse {
        res.status(401).json(.{ .@"error" = "unauthorized" });
        return;
    };
    if (token.len == 0) {
        res.status(401).json(.{ .@"error" = "empty token" });
        return;
    }
    next.call();
}

pub fn main() !void {
    const allocator = std.heap.smp_allocator;
    var app = ziez.init(allocator);
    defer app.deinit();

    app.on_error(struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            const msg = res.error_message orelse info.message;
            res.status(info.code).json(.{ .statusCode = info.code, .@"error" = msg });
        }
    }.handler);

    // Route with intercept chain: logging -> auth -> handler
    app.get("/data", ziez.intercept(.{
        loggingInterceptor,
        authInterceptor,
    }, struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .data = "secret" });
        }
    }.handler));

    // Route with automatic serialization
    app.get("/me", ziez.serialized(PublicUserConfig, struct {
        fn handler(_: *ziez.Request) anyerror!User {
            return User{
                .id = 1,
                .name = "Alice",
                .role = "admin",
                .password_hash = "$2b$12$...",
            };
        }
    }.handler));

    try app.listen("0.0.0.0:3000");
}
```

Test:

```bash
# Interceptor chain -- no auth header
curl http://localhost:3000/data
# {"error":"unauthorized"}

# Interceptor chain -- with auth header
curl -H "Authorization: Bearer token123" http://localhost:3000/data
# {"data":"secret"}

# Serialized handler -- password_hash excluded
curl http://localhost:3000/me
# {"id":1,"name":"Alice","role":"admin"}
```

---

## API Quick Reference

| Function | Purpose | Handler signature |
|---|---|---|
| `ziez.intercept(.{mw1, ...}, handler)` | Comptime middleware chain | `fn(*Request, *Response) anyerror!void` |
| `ziez.serialized(config, handler)` | Auto-serialize return value | `fn(*Request) anyerror!T` |
