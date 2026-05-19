# CORS Plugin

Imagine you run a restaurant. Your kitchen (your API server) is perfectly happy to prepare food for anyone who walks through the front door. But what happens when a customer sitting in the cafe next door (a different website) calls your kitchen on the phone and asks you to deliver food to them? The restaurant manager (the browser) has a policy: we only serve people inside our own building. That policy is the **same-origin policy**, and CORS is the mechanism that lets you selectively lift that restriction so trusted external callers can reach your kitchen too.

CORS stands for **Cross-Origin Resource Sharing**. It is a security mechanism enforced by browsers (not by servers) that controls whether a web page running at one origin (like `https://myapp.com`) is allowed to make requests to a different origin (like `https://api.myapp.com`). Without CORS headers, the browser blocks the response. With the right CORS headers, the browser lets it through.

**Important**: CORS only affects browsers. Server-to-server calls (your backend calling another API, or `curl` from a terminal) are never blocked by CORS.

---

## Installation

Add the plugin to your `build.zig.zon` dependencies:

```zig
.@"ziez-cors" = .{
    .url = "https://github.com/ziez-dev/cors/archive/refs/tags/0.1.0.tar.gz",
    .hash = "1220...hash...",
},
```

Expose it in `build.zig`:

```zig
const cors_dep = b.dependency("ziez-cors", .{
    .target = target,
    .optimize = optimize,
});
exe.root_module.addImport("ziez_cors", cors_dep.module("ziez-cors"));
```

---

## API Reference

```zig
pub const OriginPredicate = *const fn ([]const u8) bool;

pub const CorsOrigins = union(enum) {
    any: void,                              // allow all origins
    list: []const []const u8,               // whitelist of specific origins
    predicate: OriginPredicate,             // custom function
};

pub const CorsConfig = struct {
    origins: CorsOrigins = .{ .any = {} },
    methods: []const HttpMethod = &.{ .GET, .POST, .PUT, .DELETE, .PATCH, .OPTIONS },
    allowed_headers: []const []const u8 = &.{ "Content-Type", "Authorization", "X-Request-ID" },
    exposed_headers: []const []const u8 = &.{},
    credentials: bool = false,
    max_age: ?u32 = null,
};

pub fn middleware(config: CorsConfig) ziez.Middleware
pub fn setup(app: *ziez.App, config: CorsConfig) void
```

---

## Basic Usage: Allow All Origins

The simplest configuration allows every origin to access your API. This is useful during development or for fully public APIs.

```zig
const std = @import("std");
const ziez = @import("ziez");
const cors = @import("ziez_cors");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    // Allow all origins -- equivalent to Access-Control-Allow-Origin: *
    cors.setup(&app, .{
        .origins = .{ .any = {} },
    });

    app.get("/api/data", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{
                .items = .{
                    .{ .id = 1, .name = "Widget" },
                    .{ .id = 2, .name = "Gadget" },
                },
            });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

When a browser makes a request from any website, the response will include:

```
Access-Control-Allow-Origin: *
```

---

## Specific Origins Whitelist

In production, you usually want to restrict which origins can call your API. Use `.list` to provide an explicit whitelist:

```zig
const std = @import("std");
const ziez = @import("ziez");
const cors = @import("ziez_cors");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    // Only allow these two origins
    const allowed = &[_][]const u8{
        "https://myapp.com",
        "https://admin.myapp.com",
    };

    cors.setup(&app, .{
        .origins = .{ .list = allowed },
        .credentials = true,
        .max_age = 3600,
    });

    app.get("/api/user", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .name = "Alice", .role = "admin" });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

When a request arrives from `https://myapp.com`, the plugin matches it against the list and returns:

```
Access-Control-Allow-Origin: https://myapp.com
Access-Control-Allow-Credentials: true
Vary: Origin
```

The `Vary: Origin` header is automatically added whenever the origin is not `*` (when using `.list` or `.predicate`, or when `.any` is combined with `credentials: true`). This tells CDNs and proxies that the response varies depending on the Origin header, so they do not serve a cached response meant for one origin to a different origin.

If the request comes from `https://evil-site.com`, the plugin does not add any CORS headers, and the browser blocks the response.

---

## Predicate-Based Origin Checking

Sometimes you need dynamic logic instead of a hardcoded list. For example, you might want to allow all subdomains of `myapp.com`. Use the `.predicate` option with a function that returns `true` for allowed origins:

```zig
const std = @import("std");
const ziez = @import("ziez");
const cors = @import("ziez_cors");

fn isSubdomain(origin: []const u8) bool {
    const suffix = ".myapp.com";
    return std.mem.endsWith(u8, origin, suffix) or
        std.mem.eql(u8, origin, "https://myapp.com");
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    cors.setup(&app, .{
        .origins = .{ .predicate = isSubdomain },
        .credentials = true,
    });

    app.get("/api/data", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok" });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

Now `https://app.myapp.com`, `https://admin.myapp.com`, and `https://myapp.com` are all allowed, while `https://evil-site.com` is rejected. The predicate function receives the raw `Origin` header value (like `https://app.myapp.com`) and returns `true` or `false`.

---

## Configuration Fields Explained

### `origins`

Controls which origins are allowed to access your API.

| Value | Behavior |
|-------|----------|
| `.any` | Allow every origin. Sends `Access-Control-Allow-Origin: *` (when credentials are off) or echoes the specific origin (when credentials are on). |
| `.list` | Allow only the origins in the array. Echoes the requesting origin back and sets `Vary: Origin`. |
| `.predicate` | Allow origins that make the function return `true`. Echoes the requesting origin back and sets `Vary: Origin`. |

### `methods`

Which HTTP methods are permitted in cross-origin requests. Defaults to the common set: `GET, POST, PUT, DELETE, PATCH, OPTIONS`. Override if your API uses a subset:

```zig
.methods = &.{ .GET, .POST },
```

Method matching is case-insensitive, so the browser can send lowercase or uppercase method names.

### `allowed_headers`

Which request headers the browser is allowed to send in cross-origin requests. Defaults to `Content-Type`, `Authorization`, and `X-Request-ID`. If your frontend sends custom headers (like `X-Trace-ID`), add them here:

```zig
.allowed_headers = &.{
    "Content-Type",
    "Authorization",
    "X-Request-ID",
    "X-Trace-ID",
},
```

The plugin also supports a wildcard `"*"` entry in the allowed_headers list to permit any header. Header matching is case-insensitive.

### `exposed_headers`

By default, browsers only let JavaScript read a handful of "safe" response headers (`Content-Type`, `Content-Length`, etc.). If your server sends custom headers that your frontend needs to read (like `X-Total-Count` for pagination), list them here:

```zig
.exposed_headers = &.{ "X-Total-Count", "X-Request-ID" },
```

This tells the browser: "it is okay for JavaScript to read these headers from the response."

### `credentials`

Set to `true` if your frontend needs to send cookies or HTTP authentication headers with cross-origin requests. When enabled, the plugin sends `Access-Control-Allow-Credentials: true` and cannot use `*` for the origin -- it must echo back the specific requesting origin.

```zig
.credentials = true,
```

**Important behavior when `credentials` is `true`**: Even with `.any` mode, the plugin echoes the specific requesting origin and adds `Vary: Origin`. This is required by the CORS specification because browsers reject `Access-Control-Allow-Origin: *` when credentials are involved.

### `max_age`

How long (in seconds) the browser should cache the results of a preflight `OPTIONS` request. Preflight requests are an extra `OPTIONS` call the browser makes before the actual request to check if CORS is allowed. Caching avoids repeating this call for every request.

```zig
.max_age = 3600, // cache preflight for 1 hour
```

If set to `null` (the default), the `Access-Control-Max-Age` header is not sent, and the browser uses its own default (typically 5 seconds).

---

## How CORS Works Under the Hood

When a browser makes a cross-origin request, the following happens:

**Simple requests** (GET, POST with standard headers):

1. Browser sends the request with an `Origin` header
2. Server responds with `Access-Control-Allow-Origin` if the origin is allowed
3. Browser either delivers the response to JavaScript or blocks it

**Preflighted requests** (PUT, DELETE, custom headers, or non-standard content types):

1. Browser sends an `OPTIONS` request first with `Origin` and `Access-Control-Request-Method` (and optionally `Access-Control-Request-Headers`)
2. Server validates the origin, method, and headers against the CORS configuration
3. If validation passes, the server responds with `204 No Content` and the CORS headers (`Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and optionally `Access-Control-Max-Age`)
4. If validation fails, the server responds with `403 Forbidden`
5. If the preflight passes, the browser sends the actual request
6. Server responds normally with CORS headers

The ziez-cors plugin handles both simple and preflighted requests automatically. It detects preflight requests by checking for `OPTIONS` method combined with the `Access-Control-Request-Method` header. You do not need to register a separate `OPTIONS` handler -- the plugin intercepts preflight `OPTIONS` requests, validates the origin, method, and headers, and responds with the appropriate CORS headers or a `403 Forbidden`.

---

## Complete Example: REST API with CORS

This example shows a realistic REST API with specific allowed origins, credentials support, and preflight caching:

```zig
const std = @import("std");
const ziez = @import("ziez");
const cors = @import("ziez_cors");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    // CORS configuration for a production API
    const allowed_origins = &[_][]const u8{
        "https://myapp.com",
        "https://admin.myapp.com",
    };

    cors.setup(&app, .{
        .origins = .{ .list = allowed_origins },
        .methods = &.{ .GET, .POST, .PUT, .DELETE },
        .allowed_headers = &.{
            "Content-Type",
            "Authorization",
            "X-Request-ID",
        },
        .exposed_headers = &.{ "X-Total-Count" },
        .credentials = true,
        .max_age = 3600,
    });

    // List users
    app.get("/api/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            _ = res.setOrReplaceHeader("X-Total-Count", "2");
            res.json(.{
                .users = .{
                    .{ .id = 1, .name = "Alice" },
                    .{ .id = 2, .name = "Bob" },
                },
            });
        }
    }.handler);

    // Create user
    app.post("/api/users", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            _ = req;
            res.status(201).json(.{ .id = 3, .name = "Charlie" });
        }
    }.handler);

    // Update user
    app.put("/api/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id = req.param("id");
            res.json(.{ .id = id, .name = "Updated" });
        }
    }.handler);

    // Delete user
    app.delete("/api/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            _ = req;
            res.status(204).sendBody("");
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

Test it:

```bash
# Allowed origin -- returns CORS headers
curl -H "Origin: https://myapp.com" http://localhost:3000/api/users -i

# Blocked origin -- no CORS headers in response
curl -H "Origin: https://evil.com" http://localhost:3000/api/users -i

# Preflight request for PUT (browser sends this before the actual PUT)
curl -X OPTIONS \
  -H "Origin: https://myapp.com" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: Content-Type" \
  http://localhost:3000/api/users/1 -i
# Returns 204 with Access-Control-Allow-Methods, Access-Control-Allow-Headers,
# Access-Control-Max-Age: 3600
```

---

## Common Pitfalls

**CORS is not server-side security.** CORS headers only tell the browser what is allowed. A malicious actor using `curl` or a custom HTTP client ignores CORS entirely. Always validate and authenticate requests on the server side, regardless of CORS.

**`credentials: true` requires a specific origin.** When credentials are enabled, the plugin never sends `Access-Control-Allow-Origin: *`. It always echoes the requesting origin and adds `Vary: Origin`. This is enforced by the plugin automatically, so you do not need to worry about it -- but it is good to understand why.

**CORS only applies to browsers.** If your frontend is a mobile app, desktop application, or server-to-server integration, CORS is irrelevant. Those clients do not enforce the same-origin policy.

**Preflight caching matters for performance.** Without `max_age`, browsers send an `OPTIONS` request before every cross-origin request that needs preflighting. Set `max_age` to a reasonable value (like 3600 for one hour) to reduce unnecessary network traffic.
