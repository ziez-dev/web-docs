# Compression Plugin

Think about packing for a move. You could stuff your clothes into boxes as-is, taking up twice the space. Or you could use vacuum-seal bags to compress everything down, fitting the same items into half the truck. That is what response compression does for your web server: it takes the same data and shrinks it before sending it over the network, saving bandwidth and making pages load faster.

The ziez-compression plugin supports three industry-standard compression algorithms -- **gzip**, **deflate**, and **brotli** -- and automatically negotiates the best one based on what the client supports.

---

## How Compression Works

The process follows a standard content negotiation:

1. The client (browser, mobile app, or HTTP client) sends a request with an `Accept-Encoding` header listing which compression algorithms it supports: `Accept-Encoding: gzip, deflate, br`
2. Your ziez server generates the response from your handler
3. The plugin checks whether the content type is compressible and whether the response exceeds the minimum threshold
4. If both conditions are met, the plugin selects the first matching algorithm from your configured list that the client supports
5. The server sends back the compressed body with a `Content-Encoding` header indicating which algorithm was used

A typical JSON response might shrink from 4,200 bytes to 900 bytes -- a 78% reduction.

---

## Installation

Add the plugin to your `build.zig.zon` dependencies:

```zig
.@"ziez-compression" = .{
    .url = "https://github.com/ziez-dev/compression/archive/refs/tags/0.1.0.tar.gz",
    .hash = "1220...hash...",
},
```

Expose it in `build.zig`:

```zig
const compression_dep = b.dependency("ziez-compression", .{
    .target = target,
    .optimize = optimize,
});
exe.root_module.addImport("ziez_compression", compression_dep.module("ziez-compression"));
```

**Note**: The compression plugin links against the brotli C library internally. No additional setup is needed on your end -- the plugin's `build.zig` handles building and linking brotli automatically.

---

## API Reference

```zig
pub const Algorithm = enum { gzip, deflate, brotli };

pub const CompressionLevel = enum(u8) {
    level_1 = 1,
    level_2 = 2,
    level_3 = 3,
    level_4 = 4,
    level_5 = 5,
    level_6 = 6,
    level_7 = 7,
    level_8 = 8,
    level_9 = 9,
    fastest = 10,  // maps to level_1 for gzip/deflate, quality 1 for brotli
    default = 11,  // maps to level_6 for gzip/deflate, quality 6 for brotli
    best    = 12,  // maps to level_9 for gzip/deflate, quality 11 for brotli
};

pub const CompressionConfig = struct {
    enabled: bool = true,
    threshold: usize = 1024,
    level: CompressionLevel = .default,
    algorithms: []const Algorithm = &.{ .gzip, .deflate },
    mime_types: []const []const u8 = &.{
        "text/html",
        "text/css",
        "text/javascript",
        "application/json",
        "application/javascript",
        "text/plain",
        "image/svg+xml",
        "text/xml",
        "application/xml",
    },
};

pub fn setup(app: *ziez.App, config: CompressionConfig) !void
```

**Important**: Unlike most plugins, `setup()` returns `!void` (it can fail). Always call it with `try`:

```zig
try compression.setup(&app, .{});
```

The error can occur if the allocator fails to allocate memory for the configuration.

---

## Basic Usage: Default Compression

The default configuration compresses responses using gzip and deflate, skipping anything smaller than 1 KB:

```zig
const std = @import("std");
const ziez = @import("ziez");
const compression = @import("ziez_compression");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    // Use all defaults: gzip + deflate, 1KB threshold, default compression level
    try compression.setup(&app, .{});

    app.get("/api/products", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{
                .products = .{
                    .{ .id = 1, .name = "Laptop", .price = 999.99 },
                    .{ .id = 2, .name = "Mouse", .price = 29.99 },
                    .{ .id = 3, .name = "Keyboard", .price = 79.99 },
                    .{ .id = 4, .name = "Monitor", .price = 449.99 },
                    .{ .id = 5, .name = "Headphones", .price = 149.99 },
                },
            });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

Test it:

```bash
# With compression
curl -H "Accept-Encoding: gzip" http://localhost:3000/api/products --compressed -i
# Response includes: Content-Encoding: gzip

# Without compression
curl http://localhost:3000/api/products -i
# Response is uncompressed (no Accept-Encoding header sent)
```

---

## Configuration Fields Explained

### `enabled`

A quick toggle to enable or disable compression without removing the plugin setup. Useful for environment-based configuration:

```zig
try compression.setup(&app, .{
    .enabled = false, // disable in development, enable in production
});
```

### `threshold`

The minimum response body size (in bytes) to compress. Responses smaller than this are sent uncompressed. This is important because compressing very small responses can actually make them *larger* (compression adds overhead for headers and dictionaries) and wastes CPU cycles for no benefit.

```zig
.threshold = 2048, // only compress responses 2KB or larger
```

The default of 1,024 bytes (1 KB) is a good starting point for most applications.

### `level`

Controls the compression effort. Higher levels produce smaller output but take more CPU time. Lower levels are faster but produce larger output. Think of it like packing a suitcase: level 1 is tossing everything in, level 9 is meticulously folding and arranging every item.

The `CompressionLevel` type maps to different actual levels depending on the algorithm:

| Named Level | gzip/deflate (flate level) | brotli (quality) | Use Case |
|-------------|---------------------------|-------------------|----------|
| `fastest` | 1 | 1 | Real-time APIs where latency matters more than bandwidth |
| `level_1` | 1 | 1 | Same as `fastest` |
| `level_2` | 2 | 2 | Slightly better ratio, slightly slower |
| `level_3` | 3 | 3 | |
| `level_4` | 4 | 4 | |
| `level_5` | 5 | 5 | |
| `default` | 6 | 6 | Good balance for most applications |
| `level_6` | 6 | 6 | Same as `default` |
| `level_7` | 7 | 7 | |
| `level_8` | 8 | 9 | Note: brotli skips 8, jumps to 9 |
| `best` | 9 | 11 | Maximum compression for static content |
| `level_9` | 9 | 11 | Same as `best` |

```zig
.level = .best, // maximize compression, accept slower response times
```

### `algorithms`

Which compression algorithms to enable. The plugin checks the client's `Accept-Encoding` header and selects the first algorithm from your list that the client supports.

```zig
.algorithms = &.{ .brotli, .gzip, .deflate },
```

**Algorithm comparison:**

| Algorithm | Encoding Name | Compression Ratio | Speed | Browser Support | Implementation |
|-----------|--------------|-------------------|-------|-----------------|----------------|
| brotli | `br` | Best (15-25% better than gzip for text) | Slowest | All modern browsers | C binding (Google brotli library) |
| gzip | `gzip` | Good | Fast | All browsers and HTTP clients | Zig stdlib (`std.compress.flate`) |
| deflate | `deflate` | Good (same as gzip without headers) | Fast | All browsers and HTTP clients | Zig stdlib (`std.compress.flate`) |

**Tip**: List brotli first if you want the best compression for modern clients, and keep gzip as a fallback for older clients:

```zig
.algorithms = &.{ .brotli, .gzip },
```

### `mime_types`

Which content types should be compressed. The plugin uses substring matching against the `Content-Type` header -- if the MIME type string appears anywhere in the response's content type, the response is eligible for compression.

The default list covers common text-based formats:

```zig
.mime_types = &.{
    "text/html",                // HTML pages
    "text/css",                 // Stylesheets
    "text/javascript",          // JavaScript files
    "application/json",         // JSON API responses
    "application/javascript",   // JavaScript (alternate MIME)
    "text/plain",               // Plain text
    "image/svg+xml",            // SVG images (text-based, highly compressible)
    "text/xml",                 // XML documents
    "application/xml",          // XML (alternate MIME)
},
```

You can add custom MIME types if needed:

```zig
.mime_types = &.{
    "text/html",
    "application/json",
    "text/csv",                 // CSV data
    "application/wasm",         // WebAssembly (text sections can compress)
},
```

---

## When NOT to Compress

Compression is not always beneficial. The plugin automatically skips compression in these situations, but it is good to understand why:

- **Already-compressed formats**: JPEG, PNG, WebP, MP4, WebM, ZIP, GZIP, Brotli files. Compressing these again wastes CPU and can actually increase the file size. The plugin skips responses that already have a `Content-Encoding` header.
- **Very small responses**: Responses under your threshold (default 1 KB). The compression overhead makes them larger.
- **Server-Sent Events (SSE)** and streaming responses: Compression buffers data, which adds latency to real-time streams.
- **Binary formats**: Images, video, audio, PDFs. These are already compressed internally.
- **High-CPU environments**: If your server is already CPU-bound, compression adds load. Consider using `fastest` level or disabling compression.

If you serve a mix of compressible and non-compressible content, the `mime_types` filter handles this automatically. The plugin only compresses responses whose `Content-Type` matches one of the listed MIME types.

---

## Complete Example: JSON API with Brotli

This example configures brotli as the primary algorithm with gzip as fallback, a 512-byte threshold for API responses, and the full default MIME type list:

```zig
const std = @import("std");
const ziez = @import("ziez");
const compression = @import("ziez_compression");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    try compression.setup(&app, .{
        .enabled = true,
        .threshold = 512,
        .level = .default,
        .algorithms = &.{ .brotli, .gzip },
        .mime_types = &.{
            "text/html",
            "text/css",
            "text/javascript",
            "application/json",
            "application/javascript",
            "text/plain",
            "image/svg+xml",
            "text/xml",
            "application/xml",
        },
    });

    // Large JSON response -- will be compressed
    app.get("/api/catalog", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{
                .items = .{
                    .{ .id = 1, .name = "Espresso Machine", .price = 299.99, .category = "Kitchen" },
                    .{ .id = 2, .name = "French Press", .price = 24.99, .category = "Kitchen" },
                    .{ .id = 3, .name = "Pour Over Set", .price = 39.99, .category = "Kitchen" },
                    .{ .id = 4, .name = "Coffee Grinder", .price = 89.99, .category = "Kitchen" },
                    .{ .id = 5, .name = "Travel Mug", .price = 19.99, .category = "Accessories" },
                    .{ .id = 6, .name = "Thermal Carafe", .price = 34.99, .category = "Accessories" },
                    .{ .id = 7, .name = "Milk Frother", .price = 14.99, .category = "Accessories" },
                    .{ .id = 8, .name = "Digital Scale", .price = 49.99, .category = "Tools" },
                    .{ .id = 9, .name = "Kettle", .price = 59.99, .category = "Kitchen" },
                    .{ .id = 10, .name = "Tamper", .price = 29.99, .category = "Tools" },
                },
                .total = 10,
                .page = 1,
            });
        }
    }.handler);

    // Small JSON response -- below 512-byte threshold, sent uncompressed
    app.get("/api/health", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok" });
        }
    }.handler);

    // Image endpoint -- not in mime_types, sent uncompressed
    app.get("/api/image", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            _ = res.setOrReplaceHeader("Content-Type", "image/png");
            res.sendBody(""); // placeholder
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

Test it:

```bash
# Brotli -- the server prefers brotli since it is listed first in algorithms
curl -H "Accept-Encoding: br, gzip" http://localhost:3000/api/catalog --compressed -i
# Response includes: Content-Encoding: br

# Gzip only -- client does not support brotli
curl -H "Accept-Encoding: gzip" http://localhost:3000/api/catalog --compressed -i
# Response includes: Content-Encoding: gzip

# No Accept-Encoding -- client does not support compression
curl http://localhost:3000/api/catalog -i
# Response is uncompressed

# Health endpoint -- below 512-byte threshold, never compressed
curl -H "Accept-Encoding: gzip" http://localhost:3000/api/health --compressed -i
# Response is uncompressed despite Accept-Encoding header

# Image endpoint -- image/png not in mime_types, never compressed
curl -H "Accept-Encoding: gzip" http://localhost:3000/api/image --compressed -i
# Response is uncompressed
```

---

## Performance Tips

**Use `default` level for most cases.** It provides good compression (level 6) with reasonable CPU usage. Only switch to `best` for static content that is compressed once and served many times.

**Enable brotli for modern clients.** Brotli achieves significantly better compression than gzip for text content (typically 15-25% smaller output). Since all modern browsers support it, there is little reason to avoid it unless your server is CPU-constrained.

**Set a sensible threshold.** Compressing tiny responses wastes CPU. The default 1 KB threshold works well. For APIs that return many small responses (like health checks), consider raising it to 2 KB.

**Monitor CPU usage.** Compression is a CPU-intensive operation. If your server handles thousands of requests per second, watch your CPU metrics. If you are hitting limits, switch to `fastest` or reduce the number of enabled algorithms.

**Order your algorithms by preference.** The plugin picks the first algorithm from your list that the client supports. Put your preferred algorithm first. For most cases, `&.{ .brotli, .gzip }` gives the best results.
