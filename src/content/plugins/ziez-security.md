# Security Plugin

Think of your web server as a house. The router and handlers are the rooms where your family lives and works. But a house without locks on the doors, without an alarm system, and without blinds on the windows is asking for trouble. Anyone walking by can peer in, try the door handle, or even walk straight through the front door.

HTTP security headers are the locks, alarm system, and blinds for your web server. They do not change how your application works internally. Instead, they instruct browsers to enforce protective policies: "do not let other sites embed this page in a frame," "do not guess the content type," "treat all connections as HTTPS from now on," and so on.

The ziez-security plugin provides two layers of protection:

1. **Helmet-style HTTP headers** -- a collection of 13 security headers applied to every response, similar to the popular [Helmet](https://helmetjs.github.io/) library for Node.js
2. **XSS sanitization** -- automatic cleaning of request bodies and query strings to strip or escape potentially dangerous content

---

## Installation

Add the plugin to your `build.zig.zon` dependencies:

```zig
.@"ziez-security" = .{
    .url = "https://github.com/ziez-dev/security/archive/refs/tags/0.1.0.tar.gz",
    .hash = "1220...hash...",
},
```

Expose it in `build.zig`:

```zig
const security_dep = b.dependency("ziez-security", .{
    .target = target,
    .optimize = optimize,
});
exe.root_module.addImport("ziez_security", security_dep.module("ziez-security"));
```

---

## API Reference

```zig
pub const SecurityConfig = struct {
    helmet: ?HelmetConfig = .{},
    xss: ?XssConfig = .{},
};

pub const HelmetConfig = struct {
    content_security_policy: ?CspConfig = .{},
    cross_origin_opener_policy: ?[]const u8 = "same-origin",
    cross_origin_resource_policy: ?[]const u8 = "same-origin",
    origin_agent_cluster: ?[]const u8 = "?1",
    referrer_policy: ?[]const u8 = "no-referrer",
    strict_transport_security: ?HstsConfig = .{},
    x_content_type_options: ?[]const u8 = "nosniff",
    x_dns_prefetch_control: ?[]const u8 = "off",
    x_download_options: ?[]const u8 = "noopen",
    x_frame_options: ?[]const u8 = "SAMEORIGIN",
    x_permitted_cross_domain_policies: ?[]const u8 = "none",
    x_xss_protection: ?[]const u8 = "0",
    x_powered_by: bool = true,  // removes X-Powered-By when true
};

pub const XssConfig = struct {
    sanitize_body: bool = true,
    sanitize_query: bool = true,
    mode: XssMode = .strip,
};

pub const XssMode = enum { strip, escape };

pub const HstsConfig = struct {
    max_age: u32 = 31_536_000,
    include_sub_domains: bool = true,
    preload: bool = false,
};

pub const CspConfig = struct {
    use_defaults: bool = true,
    directives: []const CspDirective = &.{},
    report_only: bool = false,
};

pub const CspDirective = struct {
    name: []const u8,
    values: ?[]const []const u8 = &.{},
};

pub fn middleware(config: SecurityConfig) ziez.Middleware
pub fn setup(app: *ziez.App, config: SecurityConfig) void
```

---

## Basic Usage: Default Security

The default configuration applies all recommended security headers with sensible defaults:

```zig
const std = @import("std");
const ziez = @import("ziez");
const security = @import("ziez_security");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    // Apply all default security headers + XSS protection
    security.setup(&app, .{});

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "secure hello" });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

Every response will now include the full set of security headers. This single line gives you production-grade HTTP security out of the box.

---

## Helmet Headers Reference

The helmet component adds the following HTTP headers to every response. Each header targets a specific class of vulnerability:

| Header | Default Value | What It Prevents |
|--------|--------------|------------------|
| `Content-Security-Policy` | 11 built-in directives (see CSP section) | Injected scripts, styles, and resource loading from untrusted sources |
| `Cross-Origin-Opener-Policy` | `same-origin` | Other windows accessing your page's context via `window.opener` |
| `Cross-Origin-Resource-Policy` | `same-origin` | Other sites loading your resources via `<img>`, `<script>`, etc. |
| `Origin-Agent-Cluster` | `?1` | Cross-origin isolation for performance APIs |
| `Referrer-Policy` | `no-referrer` | Leaking URL information to third parties via the Referer header |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Downgrade attacks by forcing HTTPS for all future visits |
| `X-Content-Type-Options` | `nosniff` | MIME-type sniffing (browser guessing file types incorrectly) |
| `X-DNS-Prefetch-Control` | `off` | DNS prefetching that could leak domain info |
| `X-Download-Options` | `noopen` | Automatic execution of downloaded files in Internet Explorer |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking (your site loaded in a hidden iframe) |
| `X-Permitted-Cross-Domain-Policies` | `none` | Flash and PDF cross-domain access |
| `X-XSS-Protection` | `0` | Legacy XSS filter bugs in older browsers (disabling is safer than the buggy filter) |
| `X-Powered-By` | (header removed) | Framework fingerprinting (attackers identifying your stack) |

**Note on `x_powered_by`**: This is a `bool`, not an optional string. When `true` (default), the plugin **removes** the `X-Powered-By` header from responses to prevent framework fingerprinting. When `false`, the header is left as-is.

---

## Disabling Specific Headers

You can disable any header by setting its value to `null`. This is useful when a specific header conflicts with your application's requirements:

```zig
security.setup(&app, .{
    .helmet = .{
        // Disable CSP -- you manage it yourself elsewhere
        .content_security_policy = null,

        // Disable X-Frame-Options -- your app needs to be embedded in iframes
        .x_frame_options = null,

        // Keep all other headers at their defaults
    },
});
```

---

## XSS Protection

Cross-Site Scripting (XSS) is an attack where someone injects malicious JavaScript into your application through user input. If your server stores that input and later displays it without cleaning, the script runs in other users' browsers -- potentially stealing cookies, redirecting users, or performing actions on their behalf.

The ziez-security plugin can automatically sanitize incoming request bodies and query strings before they reach your handlers.

### How Sanitization Works

The plugin applies sanitization based on the request's `Content-Type`:

| Content-Type | Sanitization Strategy |
|-------------|----------------------|
| `application/json` | Parses JSON and sanitizes only string literal values, leaving numbers, booleans, and structure intact |
| `application/x-www-form-urlencoded` | Sanitizes only the values (after the `=`), leaving field names unchanged |
| `text/*`, `application/xml`, `application/javascript` | Full-body sanitization |
| `multipart/form-data` | Not sanitized (binary data) |

### `sanitize_body`

When `true` (default), the plugin inspects the request body for malicious content and either strips or escapes it depending on the mode.

### `sanitize_query`

When `true` (default), the plugin inspects query string parameters for malicious content.

### `mode`

Determines how suspicious content is handled:

**`.strip` mode** (default):

Removes dangerous HTML constructs entirely:

- `<script>...</script>` tags and their contents are removed
- All other HTML tags (anything between `<` and `>`) are removed, keeping only the text content
- `javascript:` URIs are removed
- Event handler attributes (`onclick=`, `onerror=`, etc.) are removed

```
Input:  <script>alert(1)</script>Hello <b>world</b>
Output: Hello world
```

**`.escape` mode**:

Converts dangerous characters to HTML entities, preserving the visible text:

- `&` becomes `&amp;`
- `<` becomes `&lt;`
- `>` becomes `&gt;`
- `"` becomes `&quot;`
- `'` becomes `&#x27;`

```
Input:  <script>alert(1)</script>
Output: &lt;script&gt;alert(1)&lt;/script&gt;
```

```zig
security.setup(&app, .{
    .xss = .{
        .sanitize_body = true,
        .sanitize_query = true,
        .mode = .escape, // keep the text, but make it harmless
    },
});
```

**When to use which mode:**

- Use `.strip` when you do not need any HTML in user input (most APIs)
- Use `.escape` when you want to display user input as-is in an HTML page (showing the code rather than executing it)

### Disabling XSS sanitization

If you have your own validation logic or need to accept HTML (for example, a CMS that stores rich text), you can disable the sanitization:

```zig
security.setup(&app, .{
    .xss = null, // disable XSS protection entirely
});
```

Or disable only body or only query sanitization:

```zig
security.setup(&app, .{
    .xss = .{
        .sanitize_body = false, // your handler validates the body itself
        .sanitize_query = true, // still sanitize query params
        .mode = .strip,
    },
});
```

---

## Content Security Policy (CSP)

Content Security Policy is the most powerful header for preventing XSS and data injection attacks. It tells the browser which sources of content are allowed to be loaded and executed. Think of it as a guest list for a party: the bouncer (browser) checks every resource against the list, and anything not on the list is turned away.

### Default CSP Directives

With `use_defaults = true` (the default), the plugin applies 11 built-in restrictive directives that only allow resources from your own origin:

| Directive | Values | What It Controls |
|-----------|--------|-----------------|
| `default-src` | `'self'` | Fallback for all resource types not explicitly listed |
| `base-uri` | `'self'` | The `<base>` element URL |
| `font-src` | `'self' https: data:` | Web fonts |
| `form-action` | `'self'` | Form submission targets |
| `frame-ancestors` | `'self'` | Which pages can embed this page in a frame |
| `img-src` | `'self' data:` | Images |
| `object-src` | `'none'` | Flash, Java applets, and other plugins (completely blocked) |
| `script-src` | `'self'` | JavaScript sources |
| `script-src-attr` | `'none'` | Inline script event handlers (completely blocked) |
| `style-src` | `'self' https: 'unsafe-inline'` | CSS sources |
| `upgrade-insecure-requests` | (no values) | Tells the browser to upgrade HTTP requests to HTTPS |

### Custom Directives

Add your own directives to extend or override the defaults. If you provide a directive with the same name as a default, your values replace the default:

```zig
security.setup(&app, .{
    .helmet = .{
        .content_security_policy = .{
            .use_defaults = true,
            .directives = &.{
                .{ .name = "script-src", .values = &.{"'self'", "https://cdn.jsdelivr.net"} },
                .{ .name = "style-src", .values = &.{"'self'", "'unsafe-inline'", "https://fonts.googleapis.com"} },
                .{ .name = "img-src", .values = &.{"'self'", "data:", "https://img.myapp.com"} },
                .{ .name = "connect-src", .values = &.{"'self'", "https://api.myapp.com"} },
            },
        },
    },
});
```

The `script-src` and `style-src` directives above override the default values because their names match the built-in directives. The `connect-src` directive is new and gets appended.

To add a directive with no values (like `upgrade-insecure-requests`), set `values` to `null` or an empty array:

```zig
.{ .name = "upgrade-insecure-requests", .values = &.{} },
```

### Report-Only Mode

If you want to test a CSP without actually blocking anything, use `report_only = true`. The browser logs violations to the console (or to a report endpoint you specify) but does not block resources. The header name changes from `Content-Security-Policy` to `Content-Security-Policy-Report-Only`:

```zig
.content_security_policy = .{
    .use_defaults = true,
    .report_only = true,
    .directives = &.{
        .{ .name = "report-uri", .values = &.{"https://api.myapp.com/csp-reports"} },
    },
},
```

This is ideal for rolling out CSP to an existing application: run in report-only mode first, analyze the violation reports, adjust your policy, then switch to enforcement mode by setting `report_only = false`.

---

## HTTP Strict Transport Security (HSTS)

HSTS tells the browser: "always use HTTPS when connecting to this domain, and never try HTTP." Once a browser sees this header, it refuses to make plain HTTP requests to your domain for the duration specified in `max_age`, even if the user types `http://` in the address bar.

The default HSTS configuration:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

```zig
security.setup(&app, .{
    .helmet = .{
        .strict_transport_security = .{
            .max_age = 31_536_000,      // 1 year in seconds (default)
            .include_sub_domains = true,  // apply to all subdomains (default)
            .preload = false,             // set true to submit to hstspreload.org
        },
    },
});
```

**Warning**: HSTS is a one-way door. Once a browser has cached the HSTS policy, it will refuse HTTP connections for the entire `max_age` period. Start with a short `max_age` (like 300 for 5 minutes) during testing, then increase it to a year for production. Make sure your HTTPS setup is solid before enabling long-duration HSTS. Consider using the [TLS Plugin](/plugins/ziez-tls) for production HTTPS.

---

## Complete Example: Production Security Configuration

This example shows a comprehensive security setup for a production API that serves a frontend application:

```zig
const std = @import("std");
const ziez = @import("ziez");
const security = @import("ziez_security");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var threaded = std.Io.Threaded.init_single_threaded;
    const io = threaded.io();

    var app = ziez.init(allocator);
    defer app.deinit();

    security.setup(&app, .{
        .helmet = .{
            .content_security_policy = .{
                .use_defaults = true,
                .directives = &.{
                    .{ .name = "script-src", .values = &.{"'self'", "https://cdn.jsdelivr.net"} },
                    .{ .name = "style-src", .values = &.{"'self'", "'unsafe-inline'", "https://fonts.googleapis.com"} },
                    .{ .name = "img-src", .values = &.{"'self'", "data:", "https://img.myapp.com"} },
                    .{ .name = "connect-src", .values = &.{"'self'", "https://api.myapp.com", "wss://api.myapp.com"} },
                    .{ .name = "font-src", .values = &.{"'self'", "https://fonts.gstatic.com"} },
                },
                .report_only = false,
            },
            .cross_origin_opener_policy = "same-origin",
            .cross_origin_resource_policy = "same-origin",
            .referrer_policy = "strict-origin-when-cross-origin",
            .strict_transport_security = .{
                .max_age = 31_536_000,
                .include_sub_domains = true,
                .preload = true,
            },
            .x_content_type_options = "nosniff",
            .x_frame_options = "DENY",
            .x_powered_by = true, // remove X-Powered-By header
        },
        .xss = .{
            .sanitize_body = true,
            .sanitize_query = true,
            .mode = .strip,
        },
    });

    // This endpoint benefits from XSS sanitization
    app.post("/api/comments", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            // The body has already been sanitized by the time we get here
            const body = req.body_raw;
            res.json(.{
                .status = "created",
                .content_length = body.len,
            });
        }
    }.handler);

    app.get("/api/data", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            // Query params have been sanitized
            const page = req.query("page") orelse "1";
            res.json(.{ .page = page, .items = .{} });
        }
    }.handler);

    try app.listen(io, "0.0.0.0:3000");
}
```

Test it:

```bash
# Check security headers on a response
curl -I http://localhost:3000/api/data
# Response includes: Content-Security-Policy, X-Content-Type-Options,
# X-Frame-Options, Strict-Transport-Security, and more

# Test XSS sanitization in query params (mode: strip)
curl "http://localhost:3000/api/data?page=<script>alert(1)</script>"
# The <script> tags are stripped from the query param before reaching your handler

# Test XSS sanitization in JSON body (mode: strip)
curl -X POST http://localhost:3000/api/comments \
  -H "Content-Type: application/json" \
  -d '{"text": "<script>alert(1)</script>"}'
# The script tags are stripped from string values in the JSON body
```

---

## Security Headers Are Not Enough

HTTP security headers are an important defense layer, but they are not a complete security strategy. You should also:

- **Validate all input** on the server side, even with XSS sanitization enabled
- **Use parameterized queries** for database access to prevent SQL injection
- **Authenticate and authorize** every sensitive endpoint
- **Keep dependencies updated** to patch known vulnerabilities
- **Use HTTPS** in production (see the [TLS Plugin](/plugins/ziez-tls))
- **Set appropriate CORS policies** (see the [CORS Plugin](/plugins/ziez-cors))

Security headers protect the browser-side interaction. Server-side protection is a separate, equally important concern.
