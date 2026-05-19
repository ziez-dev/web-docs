# Plugins Overview

Think of ziez like a brand-new car straight off the lot. It runs perfectly: the engine starts, the wheels turn, the steering works. But maybe you want a GPS navigation system, a premium audio setup, tinted windows, or a body kit. You do not rebuild the car from scratch -- you buy accessories and plug them in. That is exactly how ziez plugins work.

The base framework handles routing, requests, responses, middleware, and serialization. Plugins are modular packages that add specific capabilities on top: CORS headers, response compression, security hardening, static file serving, and more. Each plugin is a separate Zig package you add as a dependency, then activate with a single function call.

---

## What Plugins Are

A plugin is a self-contained Zig library that uses ziez's public APIs -- `app.use()` for middleware, `app.register*()` for engine-level integrations, or the convenience `setup()` functions most plugins expose -- to extend your application's behavior. Plugins never modify the framework itself. They compose on top of it, the same way a phone case, a screen protector, and a charging cable all enhance your phone without changing its operating system.

---

## How Plugins Integrate

Every plugin follows one of three integration patterns:

**1. Middleware via `app.use()`**

The plugin exports a `middleware()` function that returns a `ziez.Middleware`. You register it like any other middleware:

```zig
const cors = @import("ziez_cors");
app.use(cors.middleware(.{}));
```

**2. Convenience `setup()` function**

Most plugins also provide a `setup()` function that handles registration for you. This is the simplest option:

```zig
const cors = @import("ziez_cors");
cors.setup(&app, .{});
```

**Note**: Some plugins' `setup()` returns an error (like `!void`) and must be called with `try`:

```zig
const compression = @import("ziez_compression");
try compression.setup(&app, .{});
```

**3. Direct `app.register*()` APIs**

Some plugins hook into specific extension points (for example, registering a compression engine). These use dedicated registration methods on the `App` instance internally.

---

## General Installation Pattern

No matter which plugin you are installing, the steps are always the same:

**Step 1: Add the plugin to `build.zig.zon`**

```zig
.dependencies = .{
    .ziez = .{
        .url = "https://github.com/ziez-dev/ziez/archive/refs/tags/0.0.4.tar.gz",
        .hash = "1220...hash...",
    },
    .@"ziez-cors" = .{
        .url = "https://github.com/ziez-dev/cors/archive/refs/tags/0.1.0.tar.gz",
        .hash = "1220...hash...",
    },
},
```

**Step 2: Expose the plugin module in `build.zig`**

```zig
const ziez_dep = b.dependency("ziez", .{
    .target = target,
    .optimize = optimize,
});
const cors_dep = b.dependency("ziez-cors", .{
    .target = target,
    .optimize = optimize,
});

const exe = b.addExecutable(.{
    .name = "my-app",
    .root_module = .{
        .target = target,
        .optimize = optimize,
    },
});
exe.root_module.addImport("ziez", ziez_dep.module("ziez"));
exe.root_module.addImport("ziez_cors", cors_dep.module("ziez-cors"));
```

**Step 3: Import and activate in your application code**

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

    // Activate the plugin
    cors.setup(&app, .{});

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "hello" });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

Every plugin you see below follows this exact three-step process. The only things that change are the dependency name, the import name, and the configuration struct you pass to `setup()`.

---

## Available Plugins

| Plugin | Description | Use Case |
|--------|-------------|----------|
| **ziez-cors** | CORS middleware with origin whitelist, predicate support, and preflight handling | Browser APIs that call your server from different domains |
| **ziez-compression** | gzip, deflate, and brotli response compression with Accept-Encoding negotiation | Reducing bandwidth for text-heavy APIs and pages |
| **ziez-security** | Helmet-style HTTP security headers plus XSS body/query sanitization | Hardening any public-facing server against common attacks |
| **ziez-static** | Static file serving with Cache-Control, ETags, and dotfile policies | Hosting frontend builds, images, fonts, and CSS |
| **ziez-template** | HTML template rendering engine with layouts and caching | Server-rendered HTML pages and emails |
| **ziez-tls** | HTTPS/TLS termination with automatic HTTP-to-HTTPS redirect and mTLS | Production deployments requiring encrypted connections |
| **ziez-tracker** | Request logging with built-in User-Agent parsing | Monitoring traffic patterns and debugging requests |
| **ziez-ua-parser** | Standalone User-Agent parsing library (not a middleware) | Detecting browsers, OS, and devices from UA strings |

---

## Choosing the Right Plugins

Here is a quick guide to which plugins you might need based on your project type:

**JSON API server**

```
ziez-cors + ziez-compression + ziez-security + ziez-tracker
```

CORS lets browsers call your API. Compression shrinks JSON responses. Security adds protective headers and XSS sanitization. Tracker logs every request with parsed User-Agent data.

**Full-stack application (frontend + API)**

```
ziez-static + ziez-template + ziez-cors + ziez-compression + ziez-security
```

Static serves your compiled frontend. Template renders server-side HTML. CORS handles cross-origin API calls. Compression speeds up both static assets and API responses. Security hardens everything.

**Production deployment**

```
ziez-tls + ziez-security + ziez-compression + ziez-tracker
```

TLS encrypts traffic. Security hardens headers and sanitizes input. Compression reduces bandwidth costs. Tracker provides observability into every request.

---

## Writing Your Own Plugin

ziez plugins are just Zig libraries that call the public `App` APIs. If you want to create a custom plugin, you need to:

1. Create a new Zig package with its own `build.zig.zon`
2. Depend on `ziez` as a library dependency
3. Export a `setup(app: *ziez.App, config: YourConfig) void` function, a `middleware(config: YourConfig) ziez.Middleware` function, or both
4. Use `app.use()` internally to register middleware, or hook into any other public `App` method

Your plugin's `build.zig` exposes a named module that imports `ziez`:

```zig
// build.zig inside your plugin
const ziez_dep = b.dependency("ziez", .{
    .target = target,
    .optimize = optimize,
});
const ziez_mod = ziez_dep.module("ziez");

_ = b.addModule("ziez-myplugin", .{
    .root_source_file = b.path("src/root.zig"),
    .imports = &.{
        .{ .name = "ziez", .module = ziez_mod },
    },
});
```

Your plugin's `root.zig` exports the public API:

```zig
// src/root.zig inside your plugin
const ziez = @import("ziez");
const myplugin = @import("myplugin.zig");

pub const MyConfig = myplugin.MyConfig;

pub fn middleware(config: MyConfig) ziez.Middleware {
    return myplugin.asMiddleware(config);
}

pub fn setup(app: *ziez.App, config: MyConfig) void {
    app.use(middleware(config));
}
```

That is all there is to it. The same patterns used by the official plugins are available to you.

---

Head to the individual plugin pages below for complete usage guides with runnable code examples:

- [CORS Plugin](/plugins/ziez-cors)
- [Compression Plugin](/plugins/ziez-compression)
- [Security Plugin](/plugins/ziez-security)
- [Static Plugin](/plugins/ziez-static)
- [Template Plugin](/plugins/ziez-template)
- [TLS Plugin](/plugins/ziez-tls)
- [Tracker Plugin](/plugins/ziez-tracker)
- [UA Parser Plugin](/plugins/ziez-ua-parser)
