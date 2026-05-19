# UA Parser Plugin

A standalone User-Agent parsing library for detecting browsers, operating systems, devices, rendering engines, and CPU architectures -- without middleware or logging overhead.

---

## What is User-Agent parsing?

Every time a browser or app makes an HTTP request, it includes a `User-Agent` header -- a string that identifies itself. It looks something like this:

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36
```

This string contains a wealth of information, but it is deliberately noisy and inconsistent (browsers historically pretended to be other browsers for compatibility reasons). A User-Agent parser decodes this string into structured fields: browser name, version, operating system, device type, rendering engine, and CPU architecture.

Think of it like reading a passport. The raw machine-readable zone at the bottom of a passport is a dense strip of characters that humans cannot easily parse. But once you scan it, you get the holder's name, nationality, date of birth, and document number in a clean, structured format. The UA parser does this for User-Agent strings.

Common use cases:

- **Responsive content delivery** -- serve different HTML or redirect mobile users to a mobile-optimized site
- **Analytics** -- understand what browsers and devices your users are on
- **Bot detection** -- identify crawlers, scrapers, and automated tools using extensions
- **Compatibility warnings** -- tell users on very old browsers that your app may not work correctly
- **Targeted features** -- enable or disable features based on browser capabilities

---

## Standalone library, not middleware

Unlike most ziez plugins, the UA parser is a pure library. It does not register middleware or hooks on your application. You call its functions directly from anywhere in your code -- route handlers, middleware, background jobs, or even non-HTTP contexts.

This design gives you maximum flexibility: parse a User-Agent string whenever and wherever you need to, without any framework integration overhead.

---

## Setup

Add ziez-ua-parser to your `build.zig.zon` dependencies:

```zig
.dependencies = .{
    .ziez = .{
        .url = "https://github.com/ziez-dev/ziez/archive/refs/tags/v0.0.4.tar.gz",
        .hash = "ziez-0.0.4-zH20GkljAwCKaqElKDtJ7zsUYS4bNKGd9XY4K_CCEnjZ",
    },
    .@"ziez-ua-parser" = .{
        .url = "https://github.com/ziez-dev/ua-parser/archive/refs/tags/v0.0.4.tar.gz",
        .hash = "your-ua-parser-hash-here",
    },
},
```

Then in `build.zig`, add the import:

```zig
const ua_parser_dep = b.dependency("ziez-ua-parser", .{
    .target = target,
    .optimize = optimize,
});
exe.root_module.addImport("ziez-ua-parser", ua_parser_dep.module("ziez-ua-parser"));
```

---

## Basic usage: parse()

The `parse()` function takes a raw User-Agent string and returns a `Result` struct with all detected information. The string is automatically truncated to `UA_MAX_LENGTH` (500 bytes) and stripped of leading whitespace before parsing.

```zig
const ua_parser = @import("ziez-ua-parser");

const result = ua_parser.parse(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
);

// result.browser.name    == "Chrome"
// result.browser.version == "125.0.0.0"
// result.browser.major   == "125"
// result.os.name         == "macOS"
// result.os.version      == "10.15.7"
// result.device.type     == desktop
// result.device.vendor   == "Apple"
// result.engine.name     == "Blink"
// result.cpu.architecture == "amd64"
```

---

## Result struct

The `Result` struct contains five sub-structs, each covering a different aspect of the client environment:

```zig
pub const Result = struct {
    ua: []const u8,
    browser: Browser,
    os: Os,
    device: Device,
    engine: Engine,
    cpu: Cpu,
};
```

### browser: Browser

| Field | Type | Default | Example |
|-------|------|---------|---------|
| `.name` | `[]const u8` | `""` | `"Chrome"`, `"Firefox"`, `"Safari"` |
| `.version` | `[]const u8` | `""` | `"125.0.0.0"` |
| `.major` | `[]const u8` | `""` | `"125"` |
| `.type` | `[]const u8` | `""` | `"browser"` |

The `major` field is automatically extracted from `version` -- it is everything before the first `.`.

### os: Os

| Field | Type | Default | Example |
|-------|------|---------|---------|
| `.name` | `[]const u8` | `""` | `"Windows"`, `"macOS"`, `"Android"`, `"iOS"` |
| `.version` | `[]const u8` | `""` | `"10"`, `"14.5"`, `"13"` |

OS names are normalized. For example, `"Mac OS X"`, `"Macintosh"`, and `"mac_powerpc"` are all mapped to `"macOS"`.

### device: Device

| Field | Type | Default | Example |
|-------|------|---------|---------|
| `.type` | `?DeviceType` | `null` | `.mobile`, `.desktop`, `.tablet` |
| `.vendor` | `[]const u8` | `""` | `"Apple"`, `"Samsung"` |
| `.model` | `[]const u8` | `""` | `"iPhone"`, `"SM-G991B"` |

The `.type` field is `null` when the device category cannot be determined (common for desktop browsers).

### engine: Engine

| Field | Type | Default | Example |
|-------|------|---------|---------|
| `.name` | `[]const u8` | `""` | `"Blink"`, `"Gecko"`, `"WebKit"` |
| `.version` | `[]const u8` | `""` | `"537.36"`, `"20100101"` |

### cpu: Cpu

| Field | Type | Default | Example |
|-------|------|---------|---------|
| `.architecture` | `[]const u8` | `""` | `"amd64"`, `"arm64"` |

---

## DeviceType enum

The `DeviceType` enum covers the full range of device categories the parser can detect:

```zig
pub const DeviceType = enum {
    mobile,    // smartphones
    tablet,    // iPads, Android tablets
    desktop,   // laptops and desktop computers
    smarttv,   // smart TVs and TV sticks
    wearable,  // smartwatches, fitness trackers
    console,   // game consoles (PlayStation, Xbox)
    embedded,  // embedded browsers (kiosks, car dashboards)
    inapp,     // in-app browsers (Facebook, Instagram, WeChat)
    xr,        // VR/AR headsets (Meta Quest, Apple Vision Pro)
};
```

### deviceTypeToString

Converts a `DeviceType` (or `null`) to a human-readable string:

```zig
const name = ua_parser.deviceTypeToString(result.device.type);
// If result.device.type == .mobile, name == "mobile"
// If result.device.type == null, name == "unknown"
```

### deviceTypeFromString

Converts a string back to a `DeviceType` (case-insensitive). Returns `null` if the string does not match any known device type:

```zig
const dt = ua_parser.deviceTypeFromString("mobile");  // returns .mobile
const dt2 = ua_parser.deviceTypeFromString("Tablet"); // returns .tablet
const dt3 = ua_parser.deviceTypeFromString("unknown"); // returns null
```

---

## Parser object for reuse

If you need to parse multiple User-Agent strings and inspect individual components separately, use the `Parser` object. It stores the normalized User-Agent string and provides individual getter methods:

```zig
var parser = ua_parser.Parser.init("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ...");

const browser = parser.getBrowser();
const os = parser.getOS();
const device = parser.getDevice();
const engine = parser.getEngine();
const cpu = parser.getCPU();
const full_result = parser.getResult();

// Change the UA string and re-parse
parser.setUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0");
const desktop_result = parser.getResult();
```

| Method | Returns | Description |
|--------|---------|-------------|
| `init(ua)` | `Parser` | Create a parser with the given User-Agent string |
| `setUA(ua)` | `*Parser` | Set a new User-Agent string (returns self for chaining) |
| `getUA()` | `[]const u8` | Get the current normalized User-Agent string |
| `getBrowser()` | `Browser` | Parse and return browser info |
| `getOS()` | `Os` | Parse and return OS info |
| `getDevice()` | `Device` | Parse and return device info |
| `getEngine()` | `Engine` | Parse and return engine info |
| `getCPU()` | `Cpu` | Parse and return CPU info |
| `getResult()` | `Result` | Parse and return the full Result struct |

---

## Client Hints support

Modern browsers (Chrome 89+, Edge 89+) are moving away from the traditional `User-Agent` string toward **Client Hints** -- structured HTTP headers that provide the same information in a cleaner format. The UA parser supports parsing Client Hints alongside the User-Agent string for more accurate detection.

```zig
pub const Brand = struct {
    brand: []const u8,
    version: []const u8 = "",
};

pub const ClientHints = struct {
    brands: []const Brand = &.{},
    full_version_list: []const Brand = &.{},
    mobile: ?bool = null,
    model: []const u8 = "",
    platform: []const u8 = "",
    platform_version: []const u8 = "",
    architecture: []const u8 = "",
    bitness: []const u8 = "",
    form_factors: []const []const u8 = &.{},
};
```

Use `parseWithClientHints()` to combine both sources:

```zig
const hints = ua_parser.ClientHints{
    .platform = "Windows",
    .platform_version = "15.0.0",
    .mobile = false,
    .architecture = "x86",
    .bitness = "64",
};

const result = ua_parser.parseWithClientHints(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
    hints,
);
```

When Client Hints are available, the parser uses them to override the UA-string-based results for more precise version numbers and platform information. The hints are applied in this order:

1. **Browser hints**: Brand names are mapped (e.g., `"Google Chrome"` becomes `"Chrome"`, `"Microsoft Edge"` becomes `"Edge"`). The full version list takes priority over the short brand list.
2. **Engine hints**: Chromium-based browsers get `"Blink"` as the engine name.
3. **CPU hints**: Architecture is combined with bitness (e.g., `"x86"` + `"64"` = `"x8664"`).
4. **Device hints**: The `mobile` flag sets the device type. The `model` field is used to re-detect vendor and type by constructing a synthetic device string.
5. **OS hints**: Platform and version are used directly. Windows versions are mapped: version >= 13 becomes `"11"`, otherwise `"10"`. Xbox models override the OS name.
6. **Form factors**: Mapped to device types (e.g., `"Automotive"` -> `.embedded`, `"Watch"` -> `.wearable`, `"VR"` -> `.xr`).

Brands containing "not" and "brand" (the `"Not;A=Brand"` placeholder Chromium sends) are automatically filtered out.

---

## Extensions for bot and special detection

By default, the parser focuses on mainstream browsers, operating systems, and devices. Extensions add separate regex tables for detecting specialized clients:

```zig
pub const Extension = enum {
    bots,           // generic bots
    clis,           // command-line HTTP clients (curl, wget)
    crawlers,       // search engine crawlers (Googlebot, Bingbot)
    extra_devices,  // less common devices
    emails,         // email clients with rendering engines
    fetchers,       // fetchers and download tools
    inapps,         // in-app browsers (Facebook, Instagram)
    libraries,      // HTTP libraries (axios, requests, urllib)
    mediaplayers,   // media players (iTunes, Windows Media Player)
    vehicles,       // in-vehicle browsers
};
```

Extensions are checked first. If an extension produces a match for a given component (browser, OS, device, engine, CPU), the default rules are skipped for that component. This means extension rules have higher priority than the base rules.

Use `parseWithExtension()` for a single extension or `parseWithExtensions()` for multiple:

```zig
// Detect crawlers
const result = ua_parser.parseWithExtension(
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    .crawlers,
);

// Detect both bots and in-app browsers
const extensions = &[_]ua_parser.Extension{ .bots, .inapps };
const result2 = ua_parser.parseWithExtensions(ua_string, extensions);
```

When using `parseWithExtensions()`, extensions are tried in order. The first extension that produces a match for a component wins.

---

## parseHeaders: parse from HTTP headers directly

If you have the raw HTTP headers from a request, `parseHeaders()` extracts the `User-Agent` header and all Client Hints headers (`Sec-CH-UA`, `Sec-CH-UA-Platform`, etc.), then parses them in one step:

```zig
const headers = &[_]ua_parser.Header{
    .{ .name = "user-agent", .value = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15" },
    .{ .name = "sec-ch-ua-platform", .value = "\"iOS\"" },
    .{ .name = "sec-ch-ua-mobile", .value = "?1" },
};

const result = ua_parser.parseHeaders(headers);
```

The function looks for these headers (case-insensitive matching):

| Header | Maps to ClientHints field |
|--------|--------------------------|
| `sec-ch-ua` | `brands` |
| `sec-ch-ua-full-version-list` | `full_version_list` |
| `sec-ch-ua-mobile` | `mobile` |
| `sec-ch-ua-model` | `model` |
| `sec-ch-ua-platform` | `platform` |
| `sec-ch-ua-platform-version` | `platform_version` |
| `sec-ch-ua-arch` | `architecture` |
| `sec-ch-ua-bitness` | `bitness` |
| `sec-ch-ua-form-factors` | `form_factors` |

This is a convenience function that saves you from manually extracting headers and constructing `ClientHints` before parsing.

---

## Performance characteristics

The UA parser is designed for high-throughput server-side use:

- **Thread-local scratch buffers**: Each thread gets 96 slots of 512 bytes each, used for intermediate string operations during parsing. This means parsing does not allocate from the heap.
- **Regex caching**: Compiled PCRE2 patterns are cached in a process-global hash map protected by a mutex. The first call to parse a given pattern compiles it; subsequent calls reuse the cached version.
- **Up to 32 capture groups** per regex match, which covers all detection rules in the regex tables.
- **UA string truncation**: Input strings are automatically truncated to `UA_MAX_LENGTH` (500 bytes) before parsing to prevent runaway processing on malformed or extremely long inputs.
- **iOS 18.6 workaround**: The parser includes a special case for iOS 18.6 detection, where Apple changed version reporting. It checks the Safari version number to determine the real iOS version.

---

## Standalone vs tracker plugin

ziez offers two ways to parse User-Agent strings:

| Feature | UA Parser (this plugin) | Tracker plugin |
|---------|------------------------|----------------|
| Parse a single UA string | Yes | No (automatic only) |
| Client hints support | Yes | No |
| Extensions (bots, crawlers) | Yes | No |
| parseHeaders convenience | Yes | No |
| Parser object for reuse | Yes | No |
| deviceTypeToString helper | Yes | Yes (used internally) |
| Automatic per-request parsing | Manual setup | Yes (built-in) |
| Structured request logging | No | Yes (built-in) |
| Response timing | No | Yes (built-in) |
| Middleware integration | None (pure library) | Yes |

**Use the standalone UA parser when:**

- You need bot or crawler detection via extensions
- You want Client Hints support for modern browsers
- You need to parse User-Agent strings outside of HTTP request handling (e.g., log analysis, data migration)
- You want fine-grained control over when and how parsing happens
- You need the `Parser` object for reuse across multiple strings

**Use the tracker plugin when:**

- You want automatic structured logging for every request
- You need basic browser/device information in your request logs
- You do not need bot detection, Client Hints, or per-component parsing

---

## Example: detecting mobile vs desktop for responsive content

This example shows how to use the UA parser in a route handler to serve different content based on the client's device type. Mobile users get a lightweight page, while desktop users get the full experience.

```zig
const std = @import("std");
const ziez = @import("ziez");
const ua_parser = @import("ziez-ua-parser");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const user_agent = req.header("user-agent") orelse "";
            const result = ua_parser.parse(user_agent);

            const device = ua_parser.deviceTypeToString(result.device.type);
            const is_mobile = result.device.type != null and result.device.type.? == .mobile;

            if (is_mobile) {
                res.json(.{
                    .template = "mobile-home",
                    .device = device,
                    .os = result.os.name,
                    .browser = result.browser.name,
                });
            } else {
                res.json(.{
                    .template = "desktop-home",
                    .device = device,
                    .os = result.os.name,
                    .browser = result.browser.name,
                });
            }
        }
    }.handler);

    // Device info endpoint -- return full parsed UA details
    app.get("/api/device-info", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const user_agent = req.header("user-agent") orelse "";
            const result = ua_parser.parse(user_agent);

            res.json(.{
                .browser = .{
                    .name = result.browser.name,
                    .version = result.browser.version,
                    .major = result.browser.major,
                },
                .os = .{
                    .name = result.os.name,
                    .version = result.os.version,
                },
                .device = .{
                    .type = ua_parser.deviceTypeToString(result.device.type),
                    .vendor = result.device.vendor,
                    .model = result.device.model,
                },
                .engine = .{
                    .name = result.engine.name,
                    .version = result.engine.version,
                },
                .cpu = .{
                    .architecture = result.cpu.architecture,
                },
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

### Testing with different User-Agents

```bash
# Chrome on Windows desktop
curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36" http://localhost:3000/
```

```json
{"template":"desktop-home","device":"desktop","os":"Windows","browser":"Chrome"}
```

```bash
# Safari on iPhone
curl -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1" http://localhost:3000/
```

```json
{"template":"mobile-home","device":"mobile","os":"iOS","browser":"Mobile Safari"}
```

```bash
# Full device info
curl -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36" http://localhost:3000/api/device-info
```

```json
{
    "browser": { "name": "Chrome", "version": "125.0.0.0", "major": "125" },
    "os": { "name": "macOS", "version": "10.15.7" },
    "device": { "type": "desktop", "vendor": "Apple", "model": "Macintosh" },
    "engine": { "name": "Blink", "version": "125.0.0.0" },
    "cpu": { "architecture": "" }
}
```

---

## Example: bot detection with extensions

This example uses the crawler extension to detect search engine bots and serve them optimized content (for example, server-side rendered pages for SEO instead of JavaScript-heavy pages).

```zig
const std = @import("std");
const ziez = @import("ziez");
const ua_parser = @import("ziez-ua-parser");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/article/:slug", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const slug = req.param("slug") orelse return error.BadRequest;
            const user_agent = req.header("user-agent") orelse "";

            // Parse with crawler extension enabled
            const result = ua_parser.parseWithExtension(user_agent, .crawlers);

            const is_crawler = result.browser.name.len > 0 and
                std.mem.indexOf(u8, result.browser.name, "bot") != null;

            if (is_crawler) {
                // Serve pre-rendered HTML for SEO crawlers
                res.json(.{
                    .format = "pre-rendered",
                    .slug = slug,
                    .title = "My Article Title",
                    .content = "Full article content for crawlers...",
                    .detected_as = result.browser.name,
                });
            } else {
                // Serve the normal SPA shell for real users
                res.json(.{
                    .format = "spa",
                    .slug = slug,
                    .device = ua_parser.deviceTypeToString(result.device.type),
                });
            }
        }
    }.handler);

    // Comprehensive detection: bots + CLIs + libraries
    app.get("/api/who-are-you", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const user_agent = req.header("user-agent") orelse "";

            const extensions = &[_]ua_parser.Extension{ .crawlers, .clis, .libraries };
            const result = ua_parser.parseWithExtensions(user_agent, extensions);

            res.json(.{
                .browser = result.browser.name,
                .browser_version = result.browser.version,
                .os = result.os.name,
                .device_type = ua_parser.deviceTypeToString(result.device.type),
                .engine = result.engine.name,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

### Testing bot detection

```bash
# Google crawler
curl -H "User-Agent: Googlebot/2.1 (+http://www.google.com/bot.html)" http://localhost:3000/article/hello-world
```

```json
{"format":"pre-rendered","slug":"hello-world","title":"My Article Title","content":"Full article content for crawlers...","detected_as":"Googlebot"}
```

```bash
# Normal browser user
curl -H "User-Agent: Mozilla/5.0 Chrome/125.0.0.0" http://localhost:3000/article/hello-world
```

```json
{"format":"spa","slug":"hello-world","device":"desktop"}
```

```bash
# CLI tool
curl -H "User-Agent: curl/8.7.1" http://localhost:3000/api/who-are-you
```

```json
{"browser":"curl","browser_version":"8.7.1","os":"","device_type":"unknown","engine":""}
```

---

## API reference

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `VERSION` | `"2.0.9"` | Upstream ua-parser-js version this implementation is ported from |
| `UA_MAX_LENGTH` | `500` | Maximum User-Agent string length before truncation |

### Module-level functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `parse` | `parse(ua: []const u8) Result` | Parse a User-Agent string |
| `parseWithClientHints` | `parseWithClientHints(ua: []const u8, hints: ClientHints) Result` | Parse with Client Hints for improved accuracy |
| `parseWithExtension` | `parseWithExtension(ua: []const u8, extension: Extension) Result` | Parse with a single extension |
| `parseWithExtensions` | `parseWithExtensions(ua: []const u8, extensions: []const Extension) Result` | Parse with multiple extensions |
| `parseHeaders` | `parseHeaders(headers: []const Header) Result` | Parse from raw HTTP headers (extracts UA + Client Hints automatically) |
| `deviceTypeToString` | `deviceTypeToString(?DeviceType) []const u8` | Convert device type to string, returns `"unknown"` for null |
| `deviceTypeFromString` | `deviceTypeFromString([]const u8) ?DeviceType` | Convert string to device type (case-insensitive), returns null if no match |

### Result

| Field | Type | Description |
|-------|------|-------------|
| `ua` | `[]const u8` | The normalized User-Agent string |
| `browser` | `Browser` | Browser name, version, major version, type |
| `os` | `Os` | Operating system name and version |
| `device` | `Device` | Device type, vendor, and model |
| `engine` | `Engine` | Rendering engine name and version |
| `cpu` | `Cpu` | CPU architecture |

### DeviceType

| Value | Description |
|-------|-------------|
| `mobile` | Smartphones |
| `tablet` | Tablets (iPad, Android tablets) |
| `desktop` | Desktop and laptop computers |
| `smarttv` | Smart TVs and streaming devices |
| `wearable` | Smartwatches and fitness trackers |
| `console` | Game consoles |
| `embedded` | Embedded browsers (kiosks, car systems) |
| `inapp` | In-app browsers (Facebook, Instagram, WeChat) |
| `xr` | VR/AR headsets |

### Extension

| Value | Description |
|-------|-------------|
| `bots` | Generic bots |
| `clis` | Command-line HTTP clients |
| `crawlers` | Search engine crawlers |
| `extra_devices` | Uncommon devices |
| `emails` | Email client rendering engines |
| `fetchers` | Fetchers and download tools |
| `inapps` | In-app browsers |
| `libraries` | HTTP libraries |
| `mediaplayers` | Media players |
| `vehicles` | In-vehicle browsers |

### ClientHints

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `brands` | `[]const Brand` | `&.{}` | Browser brand list from `Sec-CH-UA` |
| `full_version_list` | `[]const Brand` | `&.{}` | Full version list from `Sec-CH-UA-Full-Version-List` |
| `mobile` | `?bool` | `null` | Mobile hint from `Sec-CH-UA-Mobile` |
| `model` | `[]const u8` | `""` | Device model from `Sec-CH-UA-Model` |
| `platform` | `[]const u8` | `""` | OS platform from `Sec-CH-UA-Platform` |
| `platform_version` | `[]const u8` | `""` | Platform version from `Sec-CH-UA-Platform-Version` |
| `architecture` | `[]const u8` | `""` | CPU architecture from `Sec-CH-UA-Arch` |
| `bitness` | `[]const u8` | `""` | Bitness from `Sec-CH-UA-Bitness` |
| `form_factors` | `[]const []const u8` | `&.{}` | Form factors from `Sec-CH-UA-Form-Factors` |
