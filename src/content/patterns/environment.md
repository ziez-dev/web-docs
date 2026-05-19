# Environment Variables

Think of environment variables like the backstage settings at a theater. The audience sees the same play (your application), but behind the curtains, the lighting, sound levels, and stage props can all be adjusted without rewriting the script. If you move the show to a bigger venue, you change the backstage configuration -- not the play itself.

In software, environment variables let you change how your application behaves (which port to listen on, which database to connect to, whether debug mode is on) without changing a single line of code. This is essential because:

- **Different environments need different settings.** Your local machine uses port 3000, but production uses port 80. Your test database is different from the real one.
- **Secrets should not live in code.** API keys, database passwords, and JWT secrets should never be committed to version control.
- **Configuration should be easy to change.** Ops teams should not need to recompile your app to change a port number.

Ziez provides a built-in `.env` file loader called `Env` that reads key-value pairs from a file and gives you typed access to them.

## Loading an .env File

Use `Env.load(allocator, path)` to read a `.env` file.

```zig
var env = try ziez.Env.load(allocator, ".env");
defer env.deinit();
```

**This function does not error if the file is missing.** If the file does not exist, it returns an empty `Env` with no variables. This is by design -- it means your app works without an `.env` file and falls back to defaults gracefully.

If you need to guarantee that certain variables exist, use `getRequired()` which will return an error when the key is missing.

## File Format

The `.env` file format is simple:

```ini
# This is a comment
PORT=3000
HOST=0.0.0.0
DEBUG=true

# Values can be quoted (quotes are stripped)
APP_NAME="My Ziez App"
DATABASE_URL="postgres://user:pass@localhost:5432/mydb"

# Empty lines are ignored

# Variables that are set but empty
LOG_LEVEL=
```

Rules:

- Lines starting with `#` are comments and are ignored.
- Blank lines are ignored.
- Each non-comment line should be `KEY=VALUE`.
- Values can be wrapped in double quotes (`"value"`) or single quotes (`'value'`). The quotes are stripped.
- Leading and trailing whitespace around keys and values is trimmed.

## Typed Access Methods

Once you have loaded the `Env`, you can read values using the following methods.

### `get(key)` -- Raw Access

Returns `?[]const u8`. Returns `null` if the key is not found.

```zig
const value = env.get("SOME_KEY"); // ?[]const u8
```

### `getOr(key, default)` -- With Fallback

Returns the value if found, otherwise returns the default.

```zig
const host = env.getOr("HOST", "0.0.0.0"); // always returns []const u8
```

### `getRequired(key)` -- Must Exist

Returns the value or `error.MissingRequiredEnvVar`. Use this for secrets and critical configuration that your app cannot function without.

```zig
const secret = try env.getRequired("JWT_SECRET");
```

### `getInt(key, T, default)` -- Parsed Integer

Parses the value as an integer of type `T`. Returns the default if the key is missing or the value cannot be parsed.

```zig
const port = env.getInt("PORT", u16, 3000);
const timeout = env.getInt("TIMEOUT_MS", u32, 5000);
```

### `getBool(key, default)` -- Parsed Boolean

Parses `true`, `false`, `1`, or `0` (case-insensitive). Returns the default if the key is missing or unrecognized.

```zig
const debug = env.getBool("DEBUG", false);
const enable_cache = env.getBool("ENABLE_CACHE", true);
```

### `getFloat(key, T, default)` -- Parsed Float

Parses the value as a float of type `T`. Returns the default if the key is missing or parsing fails.

```zig
const rate = env.getFloat("RATE_LIMIT", f64, 100.0);
```

## Access Method Summary

| Method                   | Returns             | Missing Key Behavior     | Use Case                          |
|--------------------------|---------------------|--------------------------|-----------------------------------|
| `get(key)`               | `?[]const u8`       | Returns `null`           | Optional values, raw string access |
| `getOr(key, default)`    | `[]const u8`        | Returns default          | Values with sensible fallbacks    |
| `getRequired(key)`       | `![]const u8`       | Returns error            | Secrets, critical configuration   |
| `getInt(key, T, default)`| `T`                 | Returns default          | Port numbers, timeouts, limits    |
| `getBool(key, default)`  | `bool`              | Returns default          | Feature flags, debug mode         |
| `getFloat(key, T, default)` | `T`              | Returns default          | Rate limits, thresholds           |

## Example: Sample .env File

Create a `.env` file in your project root:

```ini
# Server configuration
PORT=3000
HOST=0.0.0.0
DEBUG=true

# Application
APP_NAME=My Ziez App
API_VERSION=1

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/mydb

# Secrets (never commit real values!)
JWT_SECRET=change-me-in-production
```

## Example: Loading and Reading Values

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    // Load .env file -- returns empty Env if file is missing
    var env = try ziez.Env.load(allocator, ".env");
    defer env.deinit();

    // Typed access with defaults
    const port = env.getInt("PORT", u16, 3000);
    const host = env.getOr("HOST", "0.0.0.0");
    const debug = env.getBool("DEBUG", false);
    const app_name = env.getOr("APP_NAME", "ziez-app");
    const db_url = env.getOr("DATABASE_URL", "");
    const api_version = env.getInt("API_VERSION", u8, 1);

    std.debug.print("=== {s} configuration ===\n", .{app_name});
    std.debug.print("  HOST:PORT   : {s}:{d}\n", .{ host, port });
    std.debug.print("  DEBUG       : {}\n", .{debug});
    std.debug.print("  API_VERSION : v{d}\n", .{api_version});
    std.debug.print("  DATABASE_URL: {s}\n", .{if (db_url.len > 0) db_url else "(not set)"});
}
```

## Example: Complete App Startup with Env-Driven Config

This example shows a real application that uses environment variables to configure everything at startup.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    // Load .env file -- does NOT error if file is missing, returns empty Env
    var env = try ziez.Env.load(allocator, ".env");
    defer env.deinit();

    // Typed access with defaults
    const port = env.getInt("PORT", u16, 3000);
    const host = env.getOr("HOST", "0.0.0.0");
    const debug = env.getBool("DEBUG", false);
    const app_name = env.getOr("APP_NAME", "ziez-app");
    const db_url = env.getOr("DATABASE_URL", "");
    const api_version = env.getInt("API_VERSION", u8, 1);

    std.debug.print("=== {s} configuration ===\n", .{app_name});
    std.debug.print("  HOST:PORT  : {s}:{d}\n", .{ host, port });
    std.debug.print("  DEBUG      : {}\n", .{debug});
    std.debug.print("  API_VERSION: v{d}\n", .{api_version});
    std.debug.print("  DATABASE_URL: {s}\n", .{if (db_url.len > 0) db_url else "(not set)"});

    var app = ziez.init(allocator);
    defer app.deinit();

    if (debug) {
        app.logging(.{ .level = .debug });
        std.debug.print("[debug] verbose logging enabled\n", .{});
    }

    // Routes
    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok", .framework = "ziez" });
        }
    }.handler);

    app.get("/health", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .healthy = true });
        }
    }.handler);

    // Build the listen address from env values
    var addr_buf: [64]u8 = undefined;
    const address = std.fmt.bufPrint(&addr_buf, "{s}:{d}", .{ host, port }) catch unreachable;
    std.debug.print("Listening on {s}\n", .{address});
    try app.listen(address);
}
```

## Using getRequired for Secrets

For values your application absolutely cannot function without, use `getRequired()`. This forces you to provide them and fails loudly at startup if you forget.

```zig
const jwt_secret = try env.getRequired("JWT_SECRET");
const db_url = try env.getRequired("DATABASE_URL");
```

If `JWT_SECRET` is not in the `.env` file (or the file does not exist), the program exits immediately with `error.MissingRequiredEnvVar`. This is better than silently using an empty secret and discovering the problem in production.

## Best Practices

- **Never commit your `.env` file to version control.** Add `.env` to your `.gitignore`. Secrets in version control are a security incident waiting to happen.
- **Provide a `.env.example` file.** Create a `.env.example` with all the keys your app needs but with dummy values. This serves as documentation for other developers and makes setup easy:

```ini
# .env.example (committed to the repo)
PORT=3000
HOST=0.0.0.0
DEBUG=false
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
JWT_SECRET=change-me-in-production
```

- **Use `getRequired()` for secrets.** Anything that must be set (API keys, database URLs, secrets) should use `getRequired()` so you catch missing configuration at startup, not at runtime.
- **Use `getOr()` and `getInt()` with defaults for optional config.** Ports, hosts, and feature flags that have sensible defaults should use the fallback methods.
- **Load once at startup.** Call `Env.load()` once at the top of `main()`, read all the values you need into local variables, and pass them through your application. Do not keep the `Env` alive longer than needed.
- **Remember to call `deinit()`.** The `Env` struct allocates memory for all keys and values. Always `defer env.deinit()` after loading.
