# Static Plugin

Imagine you are running a bookstore. Your handcrafted signs, display decorations, and printed flyers are the static files -- they never change (or change rarely), and you just put them up once for everyone to see. You do not need to custom-print a new flyer every time a customer walks in. The ziez-static plugin works the same way: it serves files that do not need server-side processing -- CSS stylesheets, JavaScript bundles, images, fonts, and HTML files -- directly from disk to the client with no handler code required.

Without a static file server, you would have to write a route handler for every single file: one for `style.css`, one for `logo.png`, one for `app.js`, and so on. The static plugin eliminates all of that by mapping a directory on your filesystem to a URL path prefix.

---

## Installation

Add the plugin to your `build.zig.zon` dependencies:

```zig
.@"ziez-static" = .{
    .url = "https://github.com/ziez-dev/static/archive/refs/tags/0.1.0.tar.gz",
    .hash = "1220...hash...",
},
```

Expose it in `build.zig`:

```zig
const static_dep = b.dependency("ziez-static", .{
    .target = target,
    .optimize = optimize,
});
exe.root_module.addImport("ziez_static", static_dep.module("ziez-static"));
```

---

## API Reference

```zig
pub const DotfilePolicy = enum { deny, allow, ignore };

pub const StaticConfig = struct {
    root: []const u8,              // REQUIRED -- directory to serve files from
    prefix: []const u8 = "/",
    max_age: u32 = 86400,
    etag: bool = true,
    index: []const u8 = "index.html",
    dotfiles: DotfilePolicy = .deny,
};

pub fn middleware(config: StaticConfig) ziez.Middleware
pub fn setup(app: *ziez.App, config: StaticConfig) void
```

---

## Basic Usage: Serve a Directory

The simplest setup serves files from a local directory at the root URL path:

```zig
const std = @import("std");
const ziez = @import("ziez");
const serve_static = @import("ziez_static");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    // Serve everything in ./public at /
    serve_static.setup(&app, .{
        .root = "./public",
    });

    // Your API routes work alongside static files
    app.get("/api/status", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "running" });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

With this directory structure:

```
project/
  src/main.zig
  public/
    index.html
    css/
      style.css
    js/
      app.js
    images/
      logo.png
```

The following URLs are automatically available:

| File on Disk | URL |
|-------------|-----|
| `public/index.html` | `GET /` (served as the directory index) |
| `public/css/style.css` | `GET /css/style.css` |
| `public/js/app.js` | `GET /js/app.js` |
| `public/images/logo.png` | `GET /images/logo.png` |

No route handlers needed. The plugin intercepts requests that match files in the `public` directory and serves them directly. Requests that do not match any file are passed to the next middleware or route handler.

---

## Configuration Fields Explained

### `root`

The filesystem path to the directory containing your static files. This is the **only required field** -- there is no default. It can be a relative path (resolved from your application's working directory) or an absolute path.

```zig
.root = "./public",           // relative path
.root = "/var/www/myapp",     // absolute path
```

The plugin reads files from this directory on every request. For production deployments, consider placing static files on a fast disk or SSD.

### `prefix`

The URL path prefix where static files are served. Requests must start with this prefix to be handled by the plugin. This lets you serve static files alongside API routes without conflicts:

```zig
serve_static.setup(&app, .{
    .root = "./public",
    .prefix = "/assets",
});
```

Now files are available at `/assets/style.css`, `/assets/logo.png`, and so on. This frees up the root path `/` for your own routes:

```zig
// Static files at /assets/*
serve_static.setup(&app, .{
    .root = "./public",
    .prefix = "/assets",
});

// Your routes at /*
app.get("/", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        res.send("<h1>Welcome</h1>");
    }
}.handler);
```

### `max_age`

The `max-age` value (in seconds) for the `Cache-Control` header sent with every static file. This tells the browser (and any CDN in front of your server) how long to cache the file before checking back for a new version.

```zig
.max_age = 86400,     // 1 day (default)
.max_age = 3600,      // 1 hour
.max_age = 31536000,  // 1 year (for immutable assets with hashed filenames)
```

The plugin sends this header with every successful response:

```
Cache-Control: public, max-age=86400
```

**Choosing the right value:**

- **1 hour** (`3600`): Good for development or content that changes frequently
- **1 day** (`86400`, default): Good for CSS, JS, and images that update on each deploy
- **1 year** (`31536000`): Use with filename-hashed assets (like `app.a3b2c1.js`). The hash in the filename guarantees uniqueness, so you never serve stale content

### `etag`

When `true` (default), the plugin generates an `ETag` header for each file. The ETag is a fingerprint that identifies a specific version of the file, based on the file's last modification time and size. The format is `"{mtime}-{size}"`.

The caching flow works like this:

1. **First request**: server sends the file with `ETag: "1747584000000000-2048"`
2. **Second request**: browser sends `If-None-Match: "1747584000000000-2048"`
3. **File unchanged**: server responds `304 Not Modified` (no body, saves bandwidth)
4. **File changed**: server sends the new file with `ETag: "1747585000000000-3072"`

```zig
.etag = true,  // enable ETag support (default)
```

Leave this enabled unless you have a specific reason to disable it (for example, if you are using a CDN that handles ETags differently).

### `index`

The default file served when a request targets a directory (a URL ending in `/`). The default is `index.html`, which matches standard web convention.

```zig
.index = "index.html",  // default
.index = "home.html",   // custom default file
```

When a browser requests `GET /`, the plugin checks for `./public/index.html` (the `root` plus the `index` filename). If it exists, it is served. If not, the plugin passes the request to the next handler.

Set to an empty string `""` to disable directory index serving entirely:

```zig
.index = "",  // disable directory index
```

### `dotfiles`

Controls how files and directories starting with a dot (like `.env`, `.gitignore`, `.git/`) are handled:

| Policy | Behavior |
|--------|----------|
| `.deny` | Return `403 Forbidden` for any dotfile request. This is the default and the safest option. |
| `.allow` | Serve dotfiles like regular files. Use this only if you intentionally need to expose dotfiles. |
| `.ignore` | Pretend the dotfile does not exist -- skip it silently and pass to the next handler. |

```zig
.dotfiles = .deny,   // safest: block access to .env, .git, etc. (default)
.dotfiles = .allow,  // serve dotfiles normally (not recommended for production)
.dotfiles = .ignore, // silently skip dotfiles as if they do not exist
```

**Why this matters**: Dotfiles often contain sensitive configuration. Your `.env` file might contain database passwords, API keys, or secret tokens. Your `.git/` directory exposes your entire source code history. The default `.deny` policy prevents accidental exposure of these files.

---

## MIME Type Auto-Detection

The plugin automatically sets the correct `Content-Type` header based on the file extension. Here is the complete list of recognized file types:

| Extension | Content-Type |
|-----------|-------------|
| `.html`, `.htm` | `text/html; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.js`, `.mjs` | `application/javascript; charset=utf-8` |
| `.json` | `application/json` |
| `.txt` | `text/plain; charset=utf-8` |
| `.xml` | `application/xml` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.svg` | `image/svg+xml` |
| `.ico` | `image/x-icon` |
| `.webp` | `image/webp` |
| `.pdf` | `application/pdf` |
| `.mp4` | `video/mp4` |
| `.webm` | `video/webm` |
| `.woff` | `font/woff` |
| `.woff2` | `font/woff2` |
| `.ttf` | `font/ttf` |

Any file extension not in this list defaults to `application/octet-stream`, which tells the browser to download the file rather than try to display it.

---

## Path Security

The plugin protects against directory traversal attacks:

- Requests containing `..` in the path are rejected (prevents accessing files outside the `root` directory)
- Requests containing null bytes (`\0`) in the path are rejected (prevents path truncation attacks)
- Only `GET` and `HEAD` methods are handled -- all other methods are passed to the next handler

---

## Complete Example: Frontend Build on /assets

This example serves a compiled frontend application from the `./public` directory at the `/assets` URL prefix, with aggressive caching and ETag support:

```zig
const std = @import("std");
const ziez = @import("ziez");
const serve_static = @import("ziez_static");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    // Serve frontend build artifacts at /assets
    serve_static.setup(&app, .{
        .root = "./public",
        .prefix = "/assets",
        .max_age = 31536000, // 1 year -- filenames contain content hashes
        .etag = true,
        .index = "index.html",
        .dotfiles = .deny,
    });

    // Serve the main HTML page for the root route
    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            _ = res.setOrReplaceHeader("Content-Type", "text/html");
            res.sendBody(
                \\<!DOCTYPE html>
                \\<html>
                \\<head>
                \\  <link rel="stylesheet" href="/assets/css/style.css">
                \\</head>
                \\<body>
                \\  <div id="app"></div>
                \\  <script src="/assets/js/app.js"></script>
                \\</body>
                \\</html>
            );
        }
    }.handler);

    // API routes
    app.get("/api/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{
                .users = .{
                    .{ .id = 1, .name = "Alice" },
                    .{ .id = 2, .name = "Bob" },
                },
            });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

With this directory structure:

```
project/
  src/main.zig
  public/
    css/
      style.css
    js/
      app.js
    images/
      logo.png
      favicon.ico
```

Test it:

```bash
# Fetch a CSS file
curl http://localhost:3000/assets/css/style.css -i
# Response includes: Content-Type: text/css; charset=utf-8
# Response includes: Cache-Control: public, max-age=31536000
# Response includes: ETag: "..."

# Fetch an image
curl http://localhost:3000/assets/images/logo.png -i
# Response includes: Content-Type: image/png

# ETag caching -- second request with If-None-Match
curl http://localhost:3000/assets/css/style.css \
  -H 'If-None-Match: "1747584000000000-2048"' -i
# Response: 304 Not Modified (no body)

# Dotfile access is blocked
curl http://localhost:3000/assets/.env -i
# Response: 403 Forbidden {"error":"Forbidden","statusCode":403}

# Directory traversal is blocked
curl http://localhost:3000/assets/../../../etc/passwd -i
# Request is rejected, not served

# API route works alongside static files
curl http://localhost:3000/api/users -i
# Response: { "users": [...] }
```

---

## Serving a Single-Page Application (SPA)

If you are serving a React, Vue, or Svelte SPA where all routes should serve `index.html` (so the client-side router can handle them), register the static plugin at the root with no prefix, and add a catch-all route that serves `index.html` for any unmatched GET request:

```zig
const std = @import("std");
const ziez = @import("ziez");
const serve_static = @import("ziez_static");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    // Serve static assets (CSS, JS, images) from ./public
    serve_static.setup(&app, .{
        .root = "./public",
        .prefix = "/",
        .max_age = 86400,
        .etag = true,
        .index = "index.html",
        .dotfiles = .deny,
    });

    // Catch-all: serve index.html for any unmatched route
    // so the client-side router can take over
    app.get("/*", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            _ = res.setOrReplaceHeader("Content-Type", "text/html");
            res.sendBody(
                \\<!DOCTYPE html>
                \\<html>
                \\<head>
                \\  <script src="/app.js"></script>
                \\</head>
                \\<body>
                \\  <div id="app"></div>
                \\</body>
                \\</html>
            );
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

The static plugin serves actual files (CSS, JS, images) from the `public` directory. The catch-all route handles everything else by serving `index.html`, which boots the SPA. The client-side router then reads the URL and renders the appropriate view.

---

## HEAD Request Support

The plugin automatically handles `HEAD` requests for static files. A `HEAD` request returns all the same headers as a `GET` request (Content-Type, Content-Length, ETag, Cache-Control) but without the response body. This is useful for checking whether a file exists or has changed without downloading the entire content.

---

## Performance Considerations

**File system reads on every request**: By default, the plugin reads the file from disk for each request. For high-traffic sites, consider placing a CDN (like Cloudflare or AWS CloudFront) in front of your server to cache static files at the edge.

**Use content-hashed filenames**: If you include a hash in your filenames (like `app.a3b2c1.js`), you can set `max_age` to a full year. The hash changes when the content changes, so browsers automatically fetch the new version. This is the most efficient caching strategy for static assets.

**Keep static files small**: Minify CSS and JavaScript, optimize images (use WebP instead of PNG where possible), and compress SVG files. The [Compression Plugin](/plugins/ziez-compression) can further reduce transfer size for text-based files.
