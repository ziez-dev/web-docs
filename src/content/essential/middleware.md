# Middleware

Imagine a shopping mall. Before you reach any store, you pass through the entrance, walk past the information desk, and maybe go through a security checkpoint. Each of these stops can let you through, redirect you, or stop you entirely. Middleware in ziez works the same way: functions that sit between an incoming request and your route handler, capable of inspecting, modifying, or short-circuiting the request.

## The Middleware Function

A middleware function in ziez has this signature:

```zig
*const fn (*Request, *Response, *Next) void
```

It receives the same `Request` and `Response` as a route handler, plus a `Next` object. Calling `next.call()` passes control to the next middleware in the chain (or to the route handler if this is the last middleware). Any code placed **after** `next.call()` runs on the way back out, after the downstream handlers have finished.

This creates an "onion" pattern where each middleware wraps the next:

<div data-diagram="middleware-flow"></div>

```
Request ──> Middleware 1 ──> Middleware 2 ──> Handler
               <───────────────── <─────────────────
                         (response flows back out)
```

## Logging Middleware

A logging middleware prints request details before passing control downstream, then logs the response status on the way back.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Register middleware globally — runs for every request
    app.use(struct {
        fn logger(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
            const start = std.time.nanoTimestamp();

            std.debug.print("[{s}] {s}\n", .{
                @tagName(req.method),
                req.path,
            });

            next.call(); // pass to next middleware or handler

            const elapsed = std.time.nanoTimestamp() - start;
            const ms = @as(f64, @floatFromInt(elapsed)) / 1_000_000.0;
            std.debug.print("[DONE] {s} {s} -> {d} ({d:.2}ms)\n", .{
                @tagName(req.method),
                req.path,
                res.status_code,
                ms,
            });
        }
    }.logger);

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "hello" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

When you visit `GET /`, the console prints:

```
[GET] /
[DONE] GET / -> 200 (0.12ms)
```

## Short-Circuiting: Auth Middleware

If a middleware sends a response **without** calling `next.call()`, the chain stops. No further middleware or handler runs. This is how you implement authentication, rate limiting, and other guard logic.

Think of it as the security guard at the mall entrance: if you do not have a badge, you are not getting in, and no store will ever see you.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Auth middleware — blocks unauthenticated requests
    app.use(struct {
        fn auth(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
            const token = req.header("authorization") orelse {
                res.status(401).json(.{
                    .@"error" = "Missing authorization header",
                    .statusCode = 401,
                });
                return; // short-circuit: next.call() is never called
            };

            // In a real app, validate the token
            if (!std.mem.startsWith(u8, token, "Bearer ")) {
                res.status(403).json(.{
                    .@"error" = "Invalid token format",
                    .statusCode = 403,
                });
                return; // short-circuit
            }

            next.call(); // token is valid, continue the chain
        }
    }.auth);

    app.get("/profile", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .user = "Alice", .role = "admin" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

Test it:

```bash
# Rejected — no token
curl http://localhost:3000/profile
# {"error":"Missing authorization header","statusCode":401}

# Accepted — valid format
curl -H "Authorization: Bearer abc123" http://localhost:3000/profile
# {"user":"Alice","role":"admin"}
```

## Timing Middleware

This middleware measures how long the entire request takes by capturing the timestamp before and after `next.call()`.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.use(struct {
        fn timer(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
            const start = std.time.nanoTimestamp();

            next.call();

            const elapsed_ns = std.time.nanoTimestamp() - start;
            const elapsed_us = @divTrunc(elapsed_ns, 1000);
            std.debug.print("{s} {s} completed in {d}us (status {d})\n", .{
                @tagName(req.method),
                req.path,
                elapsed_us,
                res.status_code,
            });
        }
    }.timer);

    app.get("/slow", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            std.time.sleep(100 * std.time.ns_per_ms);
            res.json(.{ .waited = "100ms" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Group-Level Middleware

Middleware registered on a `RouteGroup` only runs for routes within that group. This lets you apply auth, logging, or rate limiting selectively.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Public route — no auth needed
    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "public home page" });
        }
    }.handler);

    // Admin group — auth middleware only applies here
    const admin = app.group("/admin");
    admin.use(struct {
        fn auth(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
            const key = req.header("x-api-key") orelse {
                res.status(401).json(.{ .@"error" = "API key required" });
                return;
            };
            if (!std.mem.eql(u8, key, "secret-key")) {
                res.status(403).json(.{ .@"error" = "Invalid API key" });
                return;
            }
            next.call();
        }
    }.auth);

    admin.get("/dashboard", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .stats = .{ .users = 1284, .uptime = "14d" } });
        }
    }.handler);

    admin.get("/settings", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .maintenance = false, .version = "2.1.0" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

`GET /` works without authentication. `GET /admin/dashboard` and `GET /admin/settings` require a valid `X-Api-Key` header.

## Middleware vs Interceptors

ziez also provides interceptors (`ziez.intercept()`), which offer richer request/response transformation with `proceed()` semantics and `serialized()` support. Here is a brief comparison:

| Feature              | Middleware                    | Interceptors                      |
|----------------------|-------------------------------|-----------------------------------|
| Signature            | `(req, res, next)`            | Struct-based with `intercept()`   |
| Chain control        | `next.call()`                 | `proceed()`                       |
| Response transform   | Manual                        | Automatic serialization support   |
| Use case             | Auth, logging, rate limiting  | Response shaping, field filtering |

Use middleware for cross-cutting concerns like auth and logging. Use interceptors when you need to transform or filter response data. See the [Interceptors](/patterns/interceptors) guide for full details.
