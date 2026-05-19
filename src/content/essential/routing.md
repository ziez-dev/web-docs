# Routing

Think of routing as the address system of a building. When someone sends a letter (an HTTP request), the postal code and street address (the URL path) tell the building exactly which office (handler function) should receive it. Different departments handle different types of mail -- some receive inquiries (GET), some receive new submissions (POST), some process updates (PUT), and some handle cancellations (DELETE).

ziez provides a declarative routing API with method-based dispatch, named parameters, wildcards, and route groups for organizing your application.

## Basic Routes

Every route binds an HTTP method and a URL pattern to a handler function. ziez supports `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, and `ALL` (matching any method).

| Method   | Purpose                          | Typical Use              |
|----------|----------------------------------|--------------------------|
| `GET`    | Read or retrieve a resource      | Fetch a user profile     |
| `POST`   | Create a new resource            | Submit a new registration|
| `PUT`    | Replace a resource entirely      | Overwrite a user record  |
| `PATCH`  | Partially update a resource      | Change a user's email    |
| `DELETE` | Remove a resource                | Delete a blog post       |
| `ALL`    | Match any HTTP method            | Catch-all fallback       |

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // GET / — read the home page
    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "welcome" });
        }
    }.handler);

    // POST /users — create a user
    app.post("/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.status(201).json(.{ .created = true });
        }
    }.handler);

    // PUT /users/42 — replace a user entirely
    app.put("/users/42", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .updated = true });
        }
    }.handler);

    // PATCH /users/42 — partially update a user
    app.patch("/users/42", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .patched = true });
        }
    }.handler);

    // DELETE /users/42 — delete a user
    app.delete("/users/42", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.status(204).sendBody("");
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Named Parameters

URL segments starting with `:` are named parameters. ziez extracts their values and makes them available through `req.param()`.

Imagine a building where apartment numbers are dynamic -- each visitor goes to the same floor, but a different unit. Named parameters work the same way: the route pattern `/users/:id` matches `/users/42`, `/users/alice`, or any other value in that position.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Match /users/:id — extract the user ID
    app.get("/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id = req.param("id") orelse return error.BadRequest;
            res.json(.{
                .id = id,
                .name = "User " ++ id,
            });
        }
    }.handler);

    // Match /posts/:postId/comments/:commentId
    app.get("/posts/:postId/comments/:commentId", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const post_id = req.param("postId") orelse return error.BadRequest;
            const comment_id = req.param("commentId") orelse return error.BadRequest;
            res.json(.{
                .postId = post_id,
                .commentId = comment_id,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

A request to `GET /users/42` returns:

```json
{ "id": "42", "name": "User 42" }
```

A request to `GET /posts/7/comments/15` returns:

```json
{ "postId": "7", "commentId": "15" }
```

## Wildcard Routes

A wildcard pattern ending in `/*` matches any path that starts with the given prefix. Think of it as a "deliver to the entire floor" instruction -- everything under that prefix is handled by the same handler.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "home" });
        }
    }.handler);

    // Match anything under /legacy/*
    app.all("/legacy/*", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            res.status(410).json(.{
                .@"error" = "This endpoint has been retired",
                .path = req.path,
            });
        }
    }.handler);

    // Catch-all fallback for unmatched routes
    app.all("/*", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.status(404).json(.{
                .@"error" = "Not Found",
                .statusCode = 404,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

Requests to `/legacy/users`, `/legacy/posts/1`, or any other `/legacy/...` path all hit the legacy handler. Any other unmatched path hits the catch-all `/*` fallback.

## Route Groups

Route groups let you apply a common prefix and shared middleware to a set of routes. Think of groups as floors in an office building: every office on a floor shares the same floor number (prefix) and the same security desk (middleware).

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // All /api routes share the /api prefix
    const api = app.group("/api");

    api.get("/health", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok" });
        }
    }.handler);

    // Nested group: /api/v1
    const v1 = api.group("/v1");

    v1.get("/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .users = .{} });
        }
    }.handler);

    v1.post("/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.status(201).json(.{ .created = true });
        }
    }.handler);

    v1.get("/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id = req.param("id") orelse return error.BadRequest;
            res.json(.{ .id = id });
        }
    }.handler);

    // Nested group: /api/v2
    const v2 = api.group("/v2");

    v2.get("/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .users = .{}, .version = 2 });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

This produces the following route table:

| Method | Pattern               | Group         |
|--------|-----------------------|---------------|
| GET    | `/api/health`         | `/api`        |
| GET    | `/api/v1/users`       | `/api/v1`     |
| POST   | `/api/v1/users`       | `/api/v1`     |
| GET    | `/api/v1/users/:id`   | `/api/v1`     |
| GET    | `/api/v2/users`       | `/api/v2`     |

## Group-Level Middleware

Groups can carry their own middleware, which runs only for routes within that group. This is useful for applying authentication, rate limiting, or logging to a subset of routes.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Public routes — no auth required
    const public = app.group("/api");

    public.get("/health", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok" });
        }
    }.handler);

    // Protected routes — auth middleware applied to the group
    const admin = app.group("/api/admin");
    admin.use(struct {
        fn auth(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
            const token = req.header("authorization");
            if (token == null) {
                res.status(401).json(.{ .@"error" = "Missing authorization header" });
                return;
            }
            next.call();
        }
    }.auth);

    admin.get("/dashboard", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "admin dashboard" });
        }
    }.handler);

    admin.get("/settings", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .settings = .{ .maintenance = false } });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

A request to `GET /api/health` works without any authentication. A request to `GET /api/admin/dashboard` without an `Authorization` header receives a `401 Unauthorized` response.

## Route Matching Flow

When a request arrives, ziez processes it through a well-defined sequence:

1. **Hooks** -- registered plugin hooks run first. Any hook returning `false` short-circuits the request.
2. **Global Middleware** -- all middleware registered with `app.use()` executes in registration order. A middleware can short-circuit by sending a response without calling `next.call()`.
3. **Hash Map Lookup** -- for static routes (no `:param` or `*`), ziez performs an O(1) hash map lookup on the exact path for the request method.
4. **Parameterized Scan** -- if no static route matched, ziez scans parameterized routes (those containing `:param`) for the request method in registration order.
5. **ALL-method Fallback** -- routes registered with `app.all()` are checked as a fallback.
6. **405 Method Not Allowed** -- if the path matches a route for a different HTTP method, ziez responds with `405` and an `Allow` header listing the permitted methods.
7. **404 Not Found** -- if nothing matched, ziez responds with `404`.

This design ensures that static routes are resolved instantly, while parameterized routes fall back to a linear scan only when needed.
