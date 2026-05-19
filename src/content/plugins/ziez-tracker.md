# Tracker Plugin

Structured request logging with built-in User-Agent parsing, all in a single plugin.

---

## What does request tracking do?

Imagine you manage a busy restaurant. Every order that comes into the kitchen has a ticket -- it records what was ordered, which table it came from, who took the order, and how long it took to prepare. If something goes wrong (a dish is cold, a customer complains), you can look back at the ticket to understand exactly what happened.

Request tracking does the same thing for your web server. Every incoming HTTP request gets a structured log entry that records the method, path, status code, response time, and -- thanks to built-in User-Agent parsing -- what browser and device the client was using. This gives you a complete audit trail of every request your server handles.

The tracker plugin combines two concerns into one:

1. **Request logging** -- a structured log entry for every HTTP request, including timing and response metadata
2. **User-Agent parsing** -- automatic extraction of browser name, operating system, and device type from the `User-Agent` header

You get both without installing or configuring a separate UA parser. Under the hood, the tracker imports `ziez-ua-parser` and calls `ua_parser.parse()` on every request when UA parsing is enabled.

---

## Setup

Add ziez-tracker to your `build.zig.zon` dependencies:

```zig
.dependencies = .{
    .ziez = .{
        .url = "https://github.com/ziez-dev/ziez/archive/refs/tags/v0.0.4.tar.gz",
        .hash = "ziez-0.0.4-zH20GkljAwCKaqElKDtJ7zsUYS4bNKGd9XY4K_CCEnjZ",
    },
    .@"ziez-tracker" = .{
        .url = "https://github.com/ziez-dev/tracker/archive/refs/tags/v0.0.4.tar.gz",
        .hash = "your-tracker-hash-here",
    },
},
```

Then in `build.zig`, add the import:

```zig
const tracker_dep = b.dependency("ziez-tracker", .{
    .target = target,
    .optimize = optimize,
});
exe.root_module.addImport("ziez-tracker", tracker_dep.module("ziez-tracker"));
```

---

## TrackerConfig

`TrackerConfig` controls which tracking features are active. Think of it as toggling different instruments on a dashboard -- you can enable just the speedometer (response time), or turn on the full instrument panel (timing, middleware tracing, device detection).

```zig
pub const TrackerConfig = struct {
    auto_request_log: bool = false,
    lifecycle_trace: bool = false,
    ua_parser_enabled: bool = true,
};
```

### auto_request_log

When `true`, the plugin registers a tracker function via `app.registerTracker()` that automatically writes a structured log entry for every completed request. You do not need to call any logging function in your handlers -- the tracker handles it transparently. When `false` (the default), you can still manually log requests using `logRequestSummary()`.

### lifecycle_trace

When `true`, the plugin sets `app.router.lifecycle_trace = true`, which enables router-level execution tracing. The router records when each middleware in the chain starts and finishes, producing a detailed timeline. This is invaluable for debugging slow middleware or understanding the request processing order. When `false` (the default), only the overall request timing is recorded.

### ua_parser_enabled

When `true` (the default), the plugin parses the `User-Agent` header on every request and populates the browser, OS, and device fields in the `RequestSummary`. The parser calls `ua_parser.parse()` and extracts the non-empty fields. When `false`, the User-Agent parsing is skipped and those fields remain `null`. Disable this if you do not need device information and want to minimize per-request processing overhead.

---

## RequestSummary

Every tracked request produces a `RequestSummary` struct -- a complete snapshot of the request and response metadata. This is the "order ticket" for each HTTP request.

```zig
pub const RequestSummary = struct {
    req_id: []const u8,
    method: []const u8,
    path: []const u8,
    status: u16,
    response_time_ms: f64,
    user_agent: ?[]const u8 = null,
    content_length: ?u64 = null,
    browser_name: ?[]const u8 = null,
    browser_version: ?[]const u8 = null,
    os_name: ?[]const u8 = null,
    os_version: ?[]const u8 = null,
    device_type: ?[]const u8 = null,
};
```

| Field | Type | Description |
|-------|------|-------------|
| `req_id` | `[]const u8` | Unique identifier for this request |
| `method` | `[]const u8` | HTTP method (`GET`, `POST`, etc.) |
| `path` | `[]const u8` | Request URL path |
| `status` | `u16` | HTTP response status code (200, 404, etc.) |
| `response_time_ms` | `f64` | Total request processing time in milliseconds |
| `user_agent` | `?[]const u8` | Raw `User-Agent` header value |
| `content_length` | `?u64` | Response body size in bytes |
| `browser_name` | `?[]const u8` | Parsed browser name (e.g., `"Chrome"`, `"Firefox"`) |
| `browser_version` | `?[]const u8` | Parsed browser version (e.g., `"125.0"`) |
| `os_name` | `?[]const u8` | Parsed operating system name (e.g., `"Windows"`, `"macOS"`) |
| `os_version` | `?[]const u8` | Parsed OS version (e.g., `"14.5"`) |
| `device_type` | `?[]const u8` | Parsed device type as a string (e.g., `"mobile"`, `"desktop"`, `"tablet"`) |

The `?` prefix on many fields means they are optional -- they will be `null` if the data was not available (for example, no `User-Agent` header was sent, or UA parsing is disabled). Note that `device_type` is stored as a string (from `deviceTypeToString`), not as the `DeviceType` enum from the UA parser.

---

## How it integrates with the logging system

The tracker plugin works with ziez's built-in structured logging system. When `auto_request_log` is enabled, the plugin creates a `RequestSummary` for each request and writes it as a structured log entry using `logger.infoFields()`. This means all request logs flow through the same logging pipeline as your application logs -- they go to the same sinks, respect the same log levels, and follow the same formatting rules.

The structured fields written by `logRequestSummary()` are:

```
event, req_id, method, path, status, response_time_ms,
user_agent, content_length, browser_name, browser_version,
os_name, os_version, device_type
```

You can also manually log a `RequestSummary` using the `logRequestSummary()` function, which gives you full control over when and how request summaries are emitted.

---

## Automatic request logging

The simplest way to use the tracker is to enable automatic logging. Every request gets a structured log entry with no extra code in your handlers:

```zig
const std = @import("std");
const ziez = @import("ziez");
const ziez_tracker = @import("ziez-tracker");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Enable the tracker with automatic request logging
    ziez_tracker.setup(&app, .{
        .auto_request_log = true,
        .ua_parser_enabled = true,
    });

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "hello" });
        }
    }.handler);

    app.get("/slow", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            std.time.sleep(100 * std.time.ns_per_ms);
            res.json(.{ .message = "that was slow" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

When a request comes in, the server log shows a structured entry like:

```json
{
    "level": "info",
    "event": "request_completed",
    "req_id": "a1b2c3d4",
    "method": "GET",
    "path": "/",
    "status": 200,
    "response_time_ms": 1.23,
    "browser_name": "Chrome",
    "browser_version": "125.0",
    "os_name": "Windows",
    "os_version": "10",
    "device_type": "desktop"
}
```

---

## Manual request logging

If you want more control -- for example, logging only certain routes or enriching the summary with custom data -- disable automatic logging and call `logRequestSummary()` yourself:

```zig
const std = @import("std");
const ziez = @import("ziez");
const ziez_tracker = @import("ziez-tracker");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Enable tracking without automatic logging
    ziez_tracker.setup(&app, .{
        .auto_request_log = false,
        .ua_parser_enabled = true,
        .lifecycle_trace = false,
    });

    app.get("/api/users", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const start = std.time.nanoTimestamp();

            // ... your handler logic ...
            res.json(.{ .users = .{} });

            const elapsed = @as(f64, @floatFromInt(std.time.nanoTimestamp() - start)) / 1_000_000.0;

            // Build a summary manually using buildSummary()
            const summary = ziez_tracker.buildSummary(
                "manual-001",              // req_id
                @tagName(req.method),      // method
                req.path,                  // path
                200,                       // status
                elapsed,                   // response_time_ms
                req.header("user-agent"),  // user_agent
                null,                      // content_length
                .{ .ua_parser_enabled = true }, // config
            );
            ziez_tracker.logRequestSummary(logger, summary);
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

The `buildSummary()` function accepts the raw request parameters and a `TrackerConfig`. When `ua_parser_enabled` is `true` in the config, it calls `ua_parser.parse()` internally and populates the browser, OS, and device fields. When `false`, those fields remain `null`.

---

## Lifecycle tracing

When `lifecycle_trace` is enabled, the tracker sets `app.router.lifecycle_trace = true`, which hooks into the router's execution tracing. This produces a detailed timeline that shows exactly where time is spent during middleware execution:

```zig
ziez_tracker.setup(&app, .{
    .auto_request_log = true,
    .lifecycle_trace = true,
    .ua_parser_enabled = true,
});
```

The trace output shows each middleware step with timestamps:

```
[trace] req=a1b2c3d4 middleware=cors enter
[trace] req=a1b2c3d4 middleware=cors exit (0.05ms)
[trace] req=a1b2c3d4 middleware=auth enter
[trace] req=a1b2c3d4 middleware=auth exit (1.20ms)
[trace] req=a1b2c3d4 handler enter
[trace] req=a1b2c3d4 handler exit (3.40ms)
```

This is particularly useful for identifying slow middleware or understanding why certain requests take longer than expected. Enable it during debugging and development, then disable it in production to reduce log volume.

---

## Complete example: tracking API usage with structured logs

This example shows a complete API server where every request is tracked with User-Agent parsing, response timing, and automatic structured logging.

### `src/main.zig`

```zig
const std = @import("std");
const ziez = @import("ziez");
const ziez_tracker = @import("ziez-tracker");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Set up the tracker with all features enabled
    ziez_tracker.setup(&app, .{
        .auto_request_log = true,
        .lifecycle_trace = true,
        .ua_parser_enabled = true,
    });

    // ── API Routes ─────────────────────────────────────────────────────────

    app.get("/api/health", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{
                .status = "healthy",
                .timestamp = "2026-05-19T12:00:00Z",
            });
        }
    }.handler);

    app.get("/api/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            const users = .{
                .{ .id = 1, .name = "Alice", .email = "alice@example.com" },
                .{ .id = 2, .name = "Bob", .email = "bob@example.com" },
            };
            res.json(.{ .users = users, .total = 2 });
        }
    }.handler);

    app.get("/api/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id = req.param("id") orelse return error.BadRequest;
            res.json(.{
                .id = id,
                .name = "Alice",
                .email = "alice@example.com",
            });
        }
    }.handler);

    app.post("/api/users", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const User = struct { name: []const u8, email: []const u8 };
            const user = req.body_json(User) orelse
                return ziez.throw(error.BadRequest, "invalid JSON body", res);
            res.status(201).json(.{
                .id = 3,
                .name = user.name,
                .email = user.email,
            });
        }
    }.handler);

    // ── Catch-all ──────────────────────────────────────────────────────────
    app.all("/*", struct {
        fn handler(_: *ziez.Request, _: *ziez.Response) !void {
            return error.NotFound;
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

### What the logs look like

When you send a few requests:

```bash
# From Chrome on Windows
curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36" http://localhost:3000/api/users

# From Safari on iPhone
curl -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1" http://localhost:3000/api/health

# From a bot
curl -H "User-Agent: Googlebot/2.1 (+http://www.google.com/bot.html)" http://localhost:3000/api/users/42
```

The server produces structured log entries for each request:

```json
{
    "level": "info",
    "event": "request_completed",
    "req_id": "f47ac10b",
    "method": "GET",
    "path": "/api/users",
    "status": 200,
    "response_time_ms": 2.15,
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    "browser_name": "Chrome",
    "browser_version": "125.0",
    "os_name": "Windows",
    "os_version": "10",
    "device_type": "desktop",
    "content_length": 142
}
```

```json
{
    "level": "info",
    "event": "request_completed",
    "req_id": "58c312a9",
    "method": "GET",
    "path": "/api/health",
    "status": 200,
    "response_time_ms": 0.84,
    "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)...",
    "browser_name": "Mobile Safari",
    "browser_version": "17.5",
    "os_name": "iOS",
    "os_version": "17.5",
    "device_type": "mobile",
    "content_length": 56
}
```

Each entry gives you a complete picture: who made the request, what they asked for, how the server responded, how long it took, and what device they were using.

---

## Relationship to the UA Parser plugin

The tracker plugin includes User-Agent parsing via the same engine that powers the standalone [UA Parser plugin](/plugins/ziez-ua-parser). It imports `ziez-ua-parser` as a dependency and calls `ua_parser.parse()` directly. When `ua_parser_enabled` is `true`, the tracker automatically parses the `User-Agent` header and populates the `browser_name`, `browser_version`, `os_name`, `os_version`, and `device_type` fields in every `RequestSummary`.

**When to use the tracker:** You want structured request logging and basic UA parsing together. This covers most use cases.

**When to use the standalone UA parser:** You need fine-grained control over parsing (extensions for bot detection, Client Hints support, parsing specific headers yourself, using the `Parser` object for reuse) without the logging infrastructure.

---

## API reference

### TrackerConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auto_request_log` | `bool` | `false` | Automatically log every request via `app.registerTracker()` |
| `lifecycle_trace` | `bool` | `false` | Enable router-level middleware execution tracing |
| `ua_parser_enabled` | `bool` | `true` | Parse User-Agent headers using `ua_parser.parse()` |

### RequestSummary

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `req_id` | `[]const u8` | (required) | Unique request identifier |
| `method` | `[]const u8` | (required) | HTTP method |
| `path` | `[]const u8` | (required) | URL path |
| `status` | `u16` | (required) | Response status code |
| `response_time_ms` | `f64` | (required) | Processing time in milliseconds |
| `user_agent` | `?[]const u8` | `null` | Raw User-Agent header |
| `content_length` | `?u64` | `null` | Response body size in bytes |
| `browser_name` | `?[]const u8` | `null` | Parsed browser name |
| `browser_version` | `?[]const u8` | `null` | Parsed browser version |
| `os_name` | `?[]const u8` | `null` | Parsed OS name |
| `os_version` | `?[]const u8` | `null` | Parsed OS version |
| `device_type` | `?[]const u8` | `null` | Parsed device type as string |

### Module-level functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `setup` | `setup(app, config) void` | Register the tracker on the app. Registers the logging callback and enables lifecycle tracing if configured. |
| `logRequestSummary` | `logRequestSummary(logger, summary) void` | Write a `RequestSummary` as structured log fields using `logger.infoFields()` |
| `buildSummary` | `buildSummary(req_id, method, path, status, response_time_ms, user_agent, content_length, config) RequestSummary` | Build a `RequestSummary` with optional UA parsing based on the provided config |
