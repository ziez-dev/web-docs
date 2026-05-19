# Logging

Think of logging like a CCTV system in a factory. Cameras are placed at key points -- the entrance, the assembly line, the shipping dock. When everything runs smoothly, you do not think about them. But when something goes wrong (a machine jams, a shipment goes missing, quality drops), you can go back to the footage and trace exactly what happened, when, and where.

In a web application, logging serves the same purpose. Every request that comes in, every error that occurs, every slow query -- all of it is recorded. When a user reports that something broke at 3 PM last Tuesday, you open the logs, search for that time, and see the full picture.

Ziez includes a structured JSON logger that is fast, configurable, and built for production use.

## Configuring the Logger

Use `app.logging(LoggerConfig)` to set up logging for your application.

```zig
app.logging(.{
    .level = .info,
    .sink = ziez.LogSink.stderr(),
});
```

### LoggerConfig Fields

| Field     | Type                  | Default               | Description                                |
|-----------|-----------------------|-----------------------|--------------------------------------------|
| `level`   | `LogLevel`            | `.info`               | Minimum log level to emit                  |
| `sink`    | `LogSink`             | `Sink.stderr()`       | Where log lines are written                |
| `redact`  | `[]const []const u8`  | `&.{}`                | Field name patterns to redact from output  |

## Log Levels

Log levels control the verbosity of your application's output. Only messages at or above the configured level are emitted. If you set `.level = .warn`, then `trace`, `debug`, and `info` messages are silently skipped -- zero overhead.

| Level     | Value | When to Use                                                           |
|-----------|-------|-----------------------------------------------------------------------|
| `trace`   | 10    | Extremely detailed internals. Function entry/exit, variable dumps. Development only. |
| `debug`   | 20    | Detailed debugging information. SQL queries, cache hits/misses. Development and staging. |
| `info`    | 30    | General operational events. Server started, request completed, user logged in. Production-safe. |
| `warn`    | 40    | Something unexpected but recoverable. Deprecated API usage, slow queries, rate limit approaching. |
| `error`   | 50    | Something failed but the app continues. Database connection lost, third-party API error. |
| `fatal`   | 60    | The application cannot continue. Out of memory, unrecoverable state. |

### Level Filtering

If you configure `.level = .info`:

- `trace` and `debug` are **skipped** (no allocation, no formatting, no cost).
- `info`, `warn`, `error`, and `fatal` are **emitted**.

This means you can put detailed `debug` and `trace` calls throughout your code without worrying about performance in production. They only run when the level is set low enough.

## JSON Output Format

Every log line is a JSON object. This makes logs machine-parseable -- you can feed them into log aggregation tools, search them with `jq`, or pipe them into dashboards.

```json
{"level":"info","ts":1705312200000,"msg":"request completed","method":"GET","path":"/users","status":200}
```

The fields are:

- `level` -- the log level as a string (`"trace"`, `"debug"`, `"info"`, `"warn"`, `"error"`, `"fatal"`)
- `ts` -- Unix timestamp in milliseconds
- `msg` -- the log message
- Additional fields from `infoFields()` or child logger bindings

## Simple Logging

Use the level-named methods to log plain messages:

```zig
const logger = app.logger;

logger.trace("entering handler");
logger.debug("cache miss for key=users");
logger.info("server started on port 3000");
logger.warn("slow query detected");
logger.err("database connection lost");
logger.fatal("out of memory, shutting down");
```

Note: `err()` is a convenience alias for `@"error"()` since `error` is a reserved keyword in Zig.

## Field Logging

Use the `*Fields()` variants to attach structured data to your log messages. The fields parameter is any anonymous struct -- its fields become JSON keys in the output.

```zig
logger.infoFields(.{
    .method = "GET",
    .path = "/users",
    .status = 200,
    .duration_ms = 42,
}, "request completed");
```

Output:

```json
{"level":"info","ts":1705312200000,"msg":"request completed","method":"GET","path":"/users","status":200,"duration_ms":42}
```

All the level variants support fields:

- `traceFields(fields, msg)`
- `debugFields(fields, msg)`
- `infoFields(fields, msg)`
- `warnFields(fields, msg)`
- `errorFields(fields, msg)`
- `fatalFields(fields, msg)`

## Field Redaction

Use the `redact` option to prevent sensitive data from appearing in logs. Any field whose name matches a redaction pattern will have its value replaced with `"[REDACTED]"`.

```zig
app.logging(.{
    .level = .info,
    .redact = &.{
        "authorization",
        "password",
        "cookie",
        "token",
    },
});
```

With this configuration:

```zig
logger.infoFields(.{
    .username = "alice",
    .password = "secret123",
    .authorization = "Bearer abc123",
}, "login attempt");
```

Output:

```json
{"level":"info","ts":1705312200000,"msg":"login attempt","username":"alice","password":"[REDACTED]","authorization":"[REDACTED]"}
```

### Redaction Pattern Matching

Patterns support dot-separated paths and wildcards (`*`):

- `"password"` -- matches any field named `password` at any depth
- `"user.password"` -- matches `password` only when nested under `user`
- `"user.*"` -- matches all fields nested under `user`

This is particularly useful for redacting nested fields:

```zig
app.logging(.{
    .level = .info,
    .redact = &.{
        "headers.authorization",
        "body.password",
    },
});
```

## Child Loggers

Use `logger.child(bindings)` to create a child logger that automatically includes extra fields in every log line. This is perfect for attaching a request ID or user context to all log messages within a handler.

```zig
const request_logger = logger.child(.{
    .request_id = "abc123",
    .user_id = 42,
});

// All log lines from request_logger will include request_id and user_id
request_logger.info("processing request");
request_logger.infoFields(.{ .path = "/users" }, "matched route");
```

Output:

```json
{"level":"info","ts":1705312200000,"request_id":"abc123","user_id":42,"msg":"processing request"}
{"level":"info","ts":1705312200000,"request_id":"abc123","user_id":42,"msg":"matched route","path":"/users"}
```

Child loggers can be chained -- a child of a child inherits all parent bindings plus adds its own:

```zig
const request_logger = logger.child(.{ .request_id = "abc123" });
const db_logger = request_logger.child(.{ .component = "database" });
// db_logger includes both request_id and component in every line
```

## Custom Sinks

A sink controls where log lines are written. The default sink writes to stderr using Zig's standard logger. You can provide your own sink to write logs anywhere -- a file, a network socket, an external service, or even discard them entirely.

A custom sink is a struct with a `writeFn` function and an optional `context` pointer:

```zig
const MySink = struct {
    fn write(_: ?*anyopaque, level: ziez.LogLevel, line: []const u8) void {
        const level_str: []const u8 = switch (level) {
            .trace => "TRACE",
            .debug => "DEBUG",
            .info => "INFO",
            .warn => "WARN",
            .@"error" => "ERROR",
            .fatal => "FATAL",
        };
        const trimmed = if (line.len > 0 and line[line.len - 1] == '\n')
            line[0 .. line.len - 1]
        else
            line;
        std.debug.print("[{s}] {s}\n", .{ level_str, trimmed });
    }

    fn sink() ziez.LogSink {
        return .{ .context = null, .writeFn = write };
    }
};
```

Use it in your app:

```zig
app.logging(.{
    .level = .debug,
    .sink = MySink.sink(),
});
```

The `writeFn` signature is:

```zig
*const fn (?*anyopaque, LogLevel, []const u8) void
```

- The first parameter is an optional context pointer (the `context` field in `LogSink`). Use this to pass state like a file handle or buffer.
- The second parameter is the log level.
- The third parameter is the pre-formatted JSON line (including the trailing newline).

### Built-in Sinks

| Sink               | Description                          |
|--------------------|--------------------------------------|
| `Sink.stderr()`    | Default. Writes to stderr via Zig's `std.log`. |
| `Sink.noop()`      | Discards all output. Useful in tests. |

## Stack Buffer

The logger uses a 4 KiB stack-allocated buffer for formatting log lines. This means that for the vast majority of log messages (which are well under 4 KiB), there is **zero heap allocation** on the fast path.

Only when a log line exceeds 4 KiB does the logger fall back to heap allocation. This makes logging extremely cheap for typical use -- no allocator traffic, no lock contention, just stack memory.

## Example: Basic Logging Configuration

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Configure logging at info level
    app.logging(.{ .level = .info });

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Example: Custom JSON Sink

```zig
const std = @import("std");
const ziez = @import("ziez");

const JsonSink = struct {
    fn write(_: ?*anyopaque, level: ziez.LogLevel, line: []const u8) void {
        const level_str: []const u8 = switch (level) {
            .trace => "TRACE",
            .debug => "DEBUG",
            .info => "INFO",
            .warn => "WARN",
            .@"error" => "ERROR",
            .fatal => "FATAL",
        };
        const trimmed = if (line.len > 0 and line[line.len - 1] == '\n')
            line[0 .. line.len - 1]
        else
            line;
        std.debug.print("[{s}] {s}\n", .{ level_str, trimmed });
    }

    fn sink() ziez.LogSink {
        return .{ .context = null, .writeFn = write };
    }
};

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.logging(.{
        .level = .debug,
        .sink = JsonSink.sink(),
    });

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Example: Field Redaction

```zig
app.logging(.{
    .level = .info,
    .redact = &.{
        "authorization",
        "password",
        "cookie",
    },
});
```

Now any logged field named `authorization`, `password`, or `cookie` will show `[REDACTED]` instead of its actual value.

## Example: Child Logger with Request ID

```zig
app.use(struct {
    fn handler(req: *ziez.Request, _: *ziez.Response, next: *ziez.Next) void {
        // Create a child logger with the request ID attached
        const req_logger = app.logger.child(.{
            .request_id = req.request_id,
        });

        req_logger.infoFields(.{
            .method = @tagName(req.method),
            .path = req.path,
        }, "incoming request");

        next.call();
    }
}.handler);
```

## Example: infoFields Usage

```zig
app.get("/users/:id", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const user_id = req.param("id") orelse return error.BadRequest;

        // Log with structured fields
        app.logger.infoFields(.{
            .action = "fetch_user",
            .user_id = user_id,
            .path = req.path,
        }, "user requested");

        res.json(.{ .id = user_id, .name = "Alice" });
    }
}.handler);
```

## Example: Complete App with Logging Middleware

This example combines logging configuration, a custom sink, field redaction, and request logging middleware.

```zig
const std = @import("std");
const ziez = @import("ziez");

// Custom log sink -- writes level-prefixed JSON lines to stderr
const JsonSink = struct {
    fn write(_: ?*anyopaque, level: ziez.LogLevel, line: []const u8) void {
        const level_str: []const u8 = switch (level) {
            .trace => "TRACE",
            .debug => "DEBUG",
            .info => "INFO",
            .warn => "WARN",
            .@"error" => "ERROR",
            .fatal => "FATAL",
        };
        const trimmed = if (line.len > 0 and line[line.len - 1] == '\n')
            line[0 .. line.len - 1]
        else
            line;
        std.debug.print("[{s}] {s}\n", .{ level_str, trimmed });
    }

    fn sink() ziez.LogSink {
        return .{ .context = null, .writeFn = write };
    }
};

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Configure: DEBUG level, custom JSON sink, redact sensitive headers
    app.logging(.{
        .level = .debug,
        .sink = JsonSink.sink(),
        .redact = &.{"authorization"},
    });

    app.on_error(struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            res.status(info.code).json(.{ .statusCode = info.code, .@"error" = info.message });
        }
    }.handler);

    // GET / -- successful request (info-level log)
    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok" });
        }
    }.handler);

    // GET /debug -- only visible with debug-level logging
    app.get("/debug", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .level = "debug", .message = "debug output enabled" });
        }
    }.handler);

    // GET /warn -- returns 429 to generate a warn-level log
    app.get("/warn", struct {
        fn handler(_: *ziez.Request, _: *ziez.Response) !void {
            return error.TooManyRequests;
        }
    }.handler);

    // GET /fail -- returns 500 to generate an error-level log
    app.get("/fail", struct {
        fn handler(_: *ziez.Request, _: *ziez.Response) !void {
            return error.InternalServerError;
        }
    }.handler);

    std.debug.print("Logging example listening on :3000\n", .{});
    std.debug.print("  Log level: DEBUG  (all requests logged)\n", .{});
    std.debug.print("  Sink: custom JSON stderr\n", .{});
    std.debug.print("  Redacted: authorization header\n", .{});
    std.debug.print("  GET /        -- 200 info log\n", .{});
    std.debug.print("  GET /debug   -- 200 debug log\n", .{});
    std.debug.print("  GET /warn    -- 429 warn log\n", .{});
    std.debug.print("  GET /fail    -- 500 error log\n", .{});
    try app.listen("0.0.0.0:3000");
}
```

Test the different log levels:

```bash
curl http://localhost:3000/       # 200 -- info
curl http://localhost:3000/debug   # 200 -- debug (only visible at debug level)
curl http://localhost:3000/warn    # 429 -- warn
curl http://localhost:3000/fail    # 500 -- error
```

## Checking If a Level Is Enabled

Use `logger.enabled(level)` to check whether a given level would produce output. This is useful before performing expensive computations that are only needed for logging:

```zig
if (logger.enabled(.trace)) {
    const dump = expensiveStateToString();
    logger.trace(dump);
}
```
