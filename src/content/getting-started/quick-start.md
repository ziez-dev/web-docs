# Quick Start

Get up and running with ziez in under 5 minutes. By the end of this page you will have a working HTTP server with routes, middleware, error handling, and JSON responses.

---

## Prerequisites

You need **Zig 0.16.0 or later** installed on your system. ziez uses language features and standard library APIs that are not available in older versions.

Open a terminal and verify your Zig version:

```bash
zig version
```

You should see `0.16.0` or higher. If you do not have Zig installed, download it from [ziglang.org/download](https://ziglang.org/download/).

---

## 1. Create a New Project

Create a directory for your project and set up the three files every ziez project needs: `build.zig.zon`, `build.zig`, and `src/main.zig`.

### Project structure

```
my-app/
  build.zig.zon    -- Package manifest (declares dependencies)
  build.zig        -- Build script (tells Zig how to compile your app)
  src/
    main.zig       -- Your application code
```

### build.zig.zon

This is the package manifest. It tells Zig where to find the ziez framework. Create `build.zig.zon` with the following content:

```zig
.{
    .name = .my-app,
    .version = "0.1.0",
    .minimum_zig_version = "0.16.0",
    .dependencies = .{
        .ziez = .{
            .url = "https://github.com/ziez-dev/ziez/archive/refs/tags/v0.0.4.tar.gz",
            .hash = "ziez-0.0.4-zH20GkljAwCKaqElKDtJ7zsUYS4bNKGd9XY4K_CCEnjZ",
        },
    },
    .paths = .{
        "build.zig",
        "build.zig.zon",
        "src",
    },
}
```

**What each field does:**

- `.name` -- The name of your project, declared as a Zig identifier (`.my-app`).
- `.version` -- Your project's version string, following semantic versioning.
- `.minimum_zig_version` -- Ensures anyone building this project has a compatible Zig version.
- `.dependencies` -- External packages your project relies on. Here we declare ziez v0.0.4, pointing to its GitHub release tarball with a content hash that Zig uses to verify the download integrity.
- `.paths` -- Which files to include when this package is used as a dependency by others.

### build.zig

This is the build script. It tells the Zig build system how to compile your application and link the ziez framework. Create `build.zig` with the following content:

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "my-app",
        .root_module = .{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
        },
    });

    // Fetch the ziez dependency declared in build.zig.zon
    const ziez_dep = b.dependency("ziez", .{
        .target = target,
        .optimize = optimize,
    });

    // Make ziez available as @import("ziez") in your code
    exe.root_module.addImport("ziez", ziez_dep.module("ziez"));

    b.installArtifact(exe);

    // Set up "zig build run" to compile and execute in one step
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());

    const run_step = b.step("run", "Run the app");
    run_step.dependOn(&run_cmd.step);
}
```

**What each section does:**

- `standardTargetOptions` and `standardOptimizeOption` -- These let you override the compilation target and optimization level from the command line (e.g., `zig build -Dtarget=x86_64-linux -Doptimize=ReleaseFast`).
- `addExecutable` -- Creates a new executable target. `root_source_file` points to your main Zig file.
- `b.dependency("ziez", ...)` -- Resolves the ziez package from your `build.zig.zon` manifest. The string `"ziez"` must match the key under `.dependencies`.
- `addImport("ziez", ...)` -- Registers the ziez module so you can write `const ziez = @import("ziez");` in your code.
- `addRunArtifact` -- Creates a build step that runs the compiled executable, wired to `zig build run`.

---

## 2. Your First Server

Now create the `src/` directory and write `src/main.zig`. This server includes multiple routes, a logging middleware, JSON body parsing, and custom error handling -- everything you need for a real API.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    // The allocator provides memory for request parsing, JSON handling, etc.
    // smp_allocator is a general-purpose allocator safe for concurrent use.
    const allocator = std.heap.smp_allocator;

    // Create the application instance
    var app = ziez.init(allocator);
    defer app.deinit();

    // ── Error Handler ──────────────────────────────────────────────────────
    // Called whenever a route handler returns an error.
    // `errorToResponse` maps Zig errors to HTTP status codes automatically:
    //   error.NotFound        -> 404
    //   error.BadRequest      -> 400
    //   error.Unauthorized    -> 401
    //   error.Forbidden       -> 403
    //   error.InternalServerError -> 500
    //   ...and many more
    app.on_error(struct {
        fn handler(req: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            const msg = res.error_message orelse info.message;
            std.debug.print("[error] {s} -> {} ({s})\n", .{ req.path, info.code, msg });
            res.status(info.code).json(.{
                .statusCode = info.code,
                .@"error" = msg,
                .path = req.path,
            });
        }
    }.handler);

    // ── Middleware ──────────────────────────────────────────────────────────
    // Runs before every route handler in the order registered.
    // Call next.call() to continue to the next middleware or the route handler.
    // If you do NOT call next.call(), the chain stops (useful for auth guards).
    app.use(struct {
        fn handler(req: *ziez.Request, _: *ziez.Response, next: *ziez.Next) void {
            std.debug.print("[ziez] {s} {s}\n", .{ @tagName(req.method), req.path });
            next.call();
        }
    }.handler);

    // ── Routes ─────────────────────────────────────────────────────────────

    // GET / -- Simple JSON response
    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{
                .message = "hello from ziez!",
                .version = "0.1.0",
            });
        }
    }.handler);

    // POST /echo -- Parse a JSON body and echo it back
    app.post("/echo", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            // Define the shape you expect from the client
            const Body = struct { name: []const u8 };
            // body_json returns null if parsing fails
            const body = req.body_json(Body) orelse
                return ziez.throw(error.BadRequest, "request body must be valid JSON with a 'name' field", res);

            res.json(.{
                .message = "hello",
                .name = body.name,
            });
        }
    }.handler);

    // ── Catch-all 404 ──────────────────────────────────────────────────────
    // The "/*" pattern matches any path. Registered last so it acts as a fallback.
    app.all("/*", struct {
        fn handler(_: *ziez.Request, _: *ziez.Response) !void {
            return error.NotFound;
        }
    }.handler);

    // ── Start Server ───────────────────────────────────────────────────────
    try app.listen("0.0.0.0:3000");
}
```

### Understanding the handler pattern

In Zig, functions cannot reference local variables from outer scopes (there are no closures). To pass a function to ziez, you declare an anonymous struct containing a named function, then pass a reference to that function using `.handler`:

```zig
struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        // your logic here
    }
}.handler
```

This may look unusual if you are coming from JavaScript or Python, but it is idiomatic Zig. The compiler evaluates these at compile time, which allows ziez to generate optimized dispatch code with zero runtime overhead.

---

## 3. Run It

Compile and start the server:

```bash
zig build run
```

You should see the server start with no errors. Now open a new terminal and test each route.

### GET /

```bash
curl http://localhost:3000/
```

```json
{"message":"hello from ziez!","version":"0.1.0"}
```

### POST /echo

```bash
curl -X POST http://localhost:3000/echo \
  -H "Content-Type: application/json" \
  -d '{"name":"world"}'
```

```json
{"message":"hello","name":"world"}
```

### Invalid JSON body

```bash
curl -X POST http://localhost:3000/echo \
  -H "Content-Type: application/json" \
  -d 'not json'
```

```json
{"statusCode":400,"error":"request body must be valid JSON with a 'name' field","path":"/echo"}
```

### 404 Not Found

```bash
curl http://localhost:3000/not-found
```

```json
{"statusCode":404,"error":"Not Found","path":"/not-found"}
```

### Server logs

In the terminal where the server is running, you will see the middleware logging each request:

```
[ziez] GET /
[ziez] POST /echo
[ziez] GET /not-found
[error] /not-found -> 404 (Not Found)
```

---

## 4. Add Features Step by Step

Now that you have a working server, let us add features one at a time. Each section builds on the previous one, so add them in order to your `src/main.zig`.

### Route parameters

Routes can contain **named parameters** using the `:name` syntax. ziez extracts the value and makes it available through `req.param()`.

Add this route after your existing `app.get("/", ...)` handler:

```zig
// GET /users/:id -- Extract a path parameter
app.get("/users/:id", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const id = req.param("id") orelse return error.BadRequest;
        res.json(.{
            .id = id,
            .name = "Alice",
        });
    }
}.handler);
```

Test it:

```bash
curl http://localhost:3000/users/42
```

```json
{"id":"42","name":"Alice"}
```

Notice that path parameters are always strings. If you need an integer, parse it in your handler:

```zig
const id = std.fmt.parseInt(u64, req.param("id") orelse return error.BadRequest, 10) catch
    return ziez.throw(error.BadRequest, "id must be a number", res);
```

Or use the built-in `paramInt` pipe (see [Validation](/patterns/validation) for details):

```zig
app.get("/users/:id", ziez.paramInt("id", u64, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, id: u64) !void {
        res.json(.{ .id = id });
    }
}.handler));
```

### Route groups with middleware

Route groups let you apply middleware to a subset of routes. This is useful for adding authentication or rate limiting to an entire API version, for example.

Add this after your existing routes:

```zig
// Create a group where all routes share the /api prefix
var api = app.group("/api");

// This middleware only runs for routes registered on the "api" group
api.use(struct {
    fn handler(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
        const auth = req.header("authorization");
        if (auth == null) {
            // Do not call next.call() -- the chain stops here
            res.status(401).json(.{ .@"error" = "authorization header required" });
            return;
        }
        next.call();
    }
}.handler);

// GET /api/status -- Protected by the group middleware above
api.get("/status", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        res.json(.{ .status = "ok", .authenticated = true });
    }
}.handler);

// GET /api/profile -- Also protected
api.get("/profile", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        res.json(.{ .username = "admin", .role = "admin" });
    }
}.handler);
```

Test with and without an authorization header:

```bash
# Without auth -- rejected by middleware
curl http://localhost:3000/api/status
```

```json
{"error":"authorization header required"}
```

```bash
# With auth -- passes through to the handler
curl -H "authorization: Bearer my-token" http://localhost:3000/api/status
```

```json
{"status":"ok","authenticated":true}
```

### Error handling with throw

ziez maps Zig error enums to HTTP status codes automatically. You can also attach custom error messages using `ziez.throw()`:

```zig
// POST /users -- Validate and create a user
app.post("/users", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const User = struct { name: []const u8, email: []const u8 };
        const user = req.body_json(User) orelse
            return ziez.throw(error.BadRequest, "request body must be valid JSON with 'name' and 'email'", res);

        if (user.name.len == 0)
            return ziez.throw(error.UnprocessableEntity, "name cannot be empty", res);

        if (user.email.len == 0)
            return ziez.throw(error.UnprocessableEntity, "email cannot be empty", res);

        res.status(201).json(.{
            .id = 1,
            .name = user.name,
            .email = user.email,
        });
    }
}.handler);
```

Test it:

```bash
# Valid request
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

```json
{"id":1,"name":"Alice","email":"alice@example.com"}
```

```bash
# Missing name
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"","email":"alice@example.com"}'
```

```json
{"statusCode":422,"error":"name cannot be empty","path":"/users"}
```

### Query parameters

Read query string values from the URL using `req.query_get()`:

```zig
// GET /search?q=ziez&page=2
app.get("/search", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const q = req.query_get("q") orelse "";
        const page = req.query_get("page") orelse "1";
        res.json(.{
            .query = q,
            .page = page,
        });
    }
}.handler);
```

```bash
curl "http://localhost:3000/search?q=ziez&page=3"
```

```json
{"query":"ziez","page":"3"}
```

---

## 5. Complete Example

Here is the full `src/main.zig` with all the features above combined into one file:

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // ── Error Handler ──────────────────────────────────────────────────────
    app.on_error(struct {
        fn handler(req: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            const msg = res.error_message orelse info.message;
            std.debug.print("[error] {s} -> {} ({s})\n", .{ req.path, info.code, msg });
            res.status(info.code).json(.{
                .statusCode = info.code,
                .@"error" = msg,
                .path = req.path,
            });
        }
    }.handler);

    // ── Global Middleware ───────────────────────────────────────────────────
    app.use(struct {
        fn handler(req: *ziez.Request, _: *ziez.Response, next: *ziez.Next) void {
            std.debug.print("[ziez] {s} {s}\n", .{ @tagName(req.method), req.path });
            next.call();
        }
    }.handler);

    // ── Routes ─────────────────────────────────────────────────────────────
    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "hello from ziez!", .version = "0.1.0" });
        }
    }.handler);

    app.post("/echo", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const Body = struct { name: []const u8 };
            const body = req.body_json(Body) orelse
                return ziez.throw(error.BadRequest, "request body must be valid JSON with a 'name' field", res);
            res.json(.{ .message = "hello", .name = body.name });
        }
    }.handler);

    app.get("/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id = req.param("id") orelse return error.BadRequest;
            res.json(.{ .id = id, .name = "Alice" });
        }
    }.handler);

    app.post("/users", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const User = struct { name: []const u8, email: []const u8 };
            const user = req.body_json(User) orelse
                return ziez.throw(error.BadRequest, "request body must be valid JSON with 'name' and 'email'", res);
            if (user.name.len == 0)
                return ziez.throw(error.UnprocessableEntity, "name cannot be empty", res);
            if (user.email.len == 0)
                return ziez.throw(error.UnprocessableEntity, "email cannot be empty", res);
            res.status(201).json(.{ .id = 1, .name = user.name, .email = user.email });
        }
    }.handler);

    app.get("/search", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const q = req.query_get("q") orelse "";
            const page = req.query_get("page") orelse "1";
            res.json(.{ .query = q, .page = page });
        }
    }.handler);

    // ── Route Group ────────────────────────────────────────────────────────
    var api = app.group("/api");
    api.use(struct {
        fn handler(req: *ziez.Request, res: *ziez.Response, next: *ziez.Next) void {
            if (req.header("authorization") == null) {
                res.status(401).json(.{ .@"error" = "authorization header required" });
                return;
            }
            next.call();
        }
    }.handler);
    api.get("/status", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok", .authenticated = true });
        }
    }.handler);
    api.get("/profile", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .username = "admin", .role = "admin" });
        }
    }.handler);

    // ── Catch-all 404 ──────────────────────────────────────────────────────
    app.all("/*", struct {
        fn handler(_: *ziez.Request, _: *ziez.Response) !void {
            return error.NotFound;
        }
    }.handler);

    // ── Start Server ───────────────────────────────────────────────────────
    try app.listen("0.0.0.0:3000");
}
```

---

## What to Read Next

Now that you have a working server, explore these topics to go deeper:

- **[Serialization](/patterns/serialization)** -- Control which fields appear in API responses, transform values, and define field groups
- **[Validation](/patterns/validation)** -- Validate incoming JSON bodies, URL parameters, and query strings with schema rules
- **[Middleware and Interceptors](/patterns/interceptors)** -- Build reusable request processing layers for auth, logging, and more
- **[Streaming](/patterns/streaming)** -- Send real-time data with SSE, NDJSON, CSV, and JSON array streaming
- **[Environment Variables](/patterns/environment)** -- Load configuration from `.env` files with type-safe accessors
- **[Cookies](/patterns/cookies)** -- Set, read, sign, and verify HTTP cookies
- **[Logging](/patterns/logging)** -- Structured JSON logging with levels, redaction, and custom sinks
