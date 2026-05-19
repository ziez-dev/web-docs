# Cookies

Think of cookies like a store loyalty card. Every time you visit a coffee shop, you bring your card. The barista reads it, sees your name and how many stamps you have, and knows exactly who you are. You did not have to introduce yourself -- the card spoke for you.

HTTP cookies work the same way. When a user visits your server for the first time, you hand them a "loyalty card" (a cookie). On every subsequent request, their browser automatically sends that cookie back. Your server reads it and remembers who they are, what they prefer, or where they left off.

Ziez provides two kinds of cookies:

- **Plain cookies** -- simple key-value pairs, like remembering a user's theme preference.
- **Signed cookies** -- values stamped with a cryptographic HMAC-SHA256 signature, so you can detect if anyone tampered with them. Perfect for sessions.

## Reading Cookies

Use `req.cookie(name)` to read a plain cookie by name. It returns `?[]const u8` -- `null` if the cookie does not exist.

Cookies are lazily parsed on the first call, so there is zero overhead until you actually read one.

```zig
const theme = req.cookie("theme") orelse "system";
```

That is all there is to it. If the browser sent `Cookie: theme=dark`, `theme` will be `"dark"`. If no `theme` cookie was sent, it falls back to `"system"`.

## Reading Signed Cookies

Use `req.signedCookie(name, secret)` to read and verify a signed cookie. The `secret` is a string only your server knows. If the cookie's signature does not match (meaning someone changed the value), `null` is returned.

```zig
const session = req.signedCookie("session", "my-secret-key") orelse {
    res.status(401).json(.{ .@"error" = "unauthorized" });
    return;
};
defer req.allocator().free(@constCast(session));
```

**Important:** `signedCookie()` allocates memory for the returned value. You must free it when you are done. Use the request's arena allocator so it is cleaned up automatically.

## Setting Cookies

Use `res.setCookie(name, value, CookieOptions)` to send a `Set-Cookie` header to the browser.

```zig
res.setCookie("theme", "dark", .{
    .path = "/",
    .max_age = 86400 * 30, // 30 days in seconds
    .same_site = .lax,
});
```

### CookieOptions Fields

Every field in `CookieOptions` has sensible defaults (all disabled or null). You only set what you need.

| Field          | Type           | Default   | Description                                                       |
|----------------|----------------|-----------|-------------------------------------------------------------------|
| `max_age`      | `?i64`         | `null`    | Seconds until the cookie expires. Takes precedence over `expires` |
| `expires`      | `?[]const u8`  | `null`    | HTTP date string (e.g. `"Wed, 21 Oct 2025 07:28:00 GMT"`)        |
| `http_only`    | `bool`         | `false`   | If `true`, JavaScript cannot read this cookie (XSS protection)   |
| `secure`       | `bool`         | `false`   | If `true`, cookie is only sent over HTTPS                         |
| `same_site`    | `?SameSite`    | `null`    | Controls cross-site sending behavior                              |
| `path`         | `?[]const u8`  | `null`    | URL path the cookie is scoped to                                  |
| `domain`       | `?[]const u8`  | `null`    | Domain the cookie is scoped to (e.g. `".example.com"`)           |
| `partitioned`  | `bool`         | `false`   | Enables CHIPS partitioned cookies for third-party contexts         |

### SameSite Values

The `SameSite` enum controls when cookies are sent with cross-site requests.

| Value      | When to use                                                                                                     |
|------------|-----------------------------------------------------------------------------------------------------------------|
| `.strict`  | Session cookies, CSRF-sensitive actions. The cookie is **never** sent on cross-site requests. Highest security. |
| `.lax`     | General-purpose cookies (default browser behavior). The cookie is sent on **top-level navigation** (clicking a link to your site) but not on embedded requests (images, iframes). |
| `.none`    | Third-party integrations, OAuth callbacks. The cookie is sent on **all** requests. **Requires `secure = true`.**   |

## Setting Signed Cookies

Use `res.setSignedCookie(name, value, opts, secret)` to write a cookie whose value is cryptographically signed.

```zig
try res.setSignedCookie("session", "user:admin", .{
    .http_only = true,
    .same_site = .strict,
    .max_age = 3600, // 1 hour
    .path = "/",
}, "my-secret-key");
```

This writes a `Set-Cookie` header with the value in `value.signature` format. For example:

```
Set-Cookie: session=user%3Aadmin.a1b2c3d4...; HttpOnly; SameSite=Strict; Max-Age=3600; Path=/
```

The signature is generated using HMAC-SHA256 with your secret key. When you read it back with `req.signedCookie()`, the framework re-computes the signature and compares it. If even one character of the value was changed, the signatures will not match and `null` is returned.

## Clearing Cookies

Use `res.clearCookie(name, opts)` to delete a cookie. It works by setting `max_age` to `0` and the value to an empty string, which tells the browser to discard it.

```zig
res.clearCookie("session", .{ .path = "/" });
```

**Important:** The `path` (and `domain`) you pass to `clearCookie()` must exactly match what you used when you set the cookie. Browsers identify cookies by name + domain + path. If they do not match, the browser will not delete the correct cookie.

## How HMAC-SHA256 Signing Works

You do not need to understand the cryptography to use signed cookies, but here is the conceptual picture:

1. You have a **secret key** (a string only your server knows, like `"my-secret-key"`).
2. When setting a signed cookie, the framework combines the cookie value and the secret key through a mathematical function called HMAC-SHA256. This produces a fixed-length **signature** (a string of hex characters).
3. The signature is appended to the value with a dot: `value.signature`.
4. When reading the cookie back, the framework splits the value and signature, recomputes the signature from the value + your secret, and checks if they match.
5. The comparison is **timing-safe** -- it takes the same amount of time whether the signatures match or not, preventing timing attacks.

If someone changes the cookie value without knowing your secret, the recomputed signature will not match, and `signedCookie()` returns `null`.

## Example: Set and Read a Plain Cookie (Theme Preference)

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Set a theme cookie via query parameter
    // GET /theme?set=dark
    app.get("/theme", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const theme = req.query_get("set") orelse "dark";
            res.setCookie("theme", theme, .{
                .path = "/",
                .max_age = 86400 * 30, // 30 days
                .same_site = .lax,
            });
            res.json(.{ .message = "theme cookie set", .theme = theme });
        }
    }.handler);

    // Read the theme cookie back
    // GET /prefs
    app.get("/prefs", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const theme = req.cookie("theme") orelse "system";
            res.json(.{ .theme = theme });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

Test it:

```bash
# Set the theme
curl http://localhost:3000/theme?set=dark
# {"message":"theme cookie set","theme":"dark"}

# Read it back (include the cookie from the previous response)
curl -b "theme=dark" http://localhost:3000/prefs
# {"theme":"dark"}
```

## Example: Set and Read a Signed Cookie (Session)

```zig
const std = @import("std");
const ziez = @import("ziez");

const SECRET = "super-secret-hmac-key-minimum-32-characters!!";

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Set a signed session cookie
    app.get("/login", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            try res.setSignedCookie("session", "user:admin", .{
                .http_only = true,
                .secure = true,
                .same_site = .strict,
                .max_age = 3600,
                .path = "/",
            }, SECRET);

            res.json(.{ .loggedIn = true });
        }
    }.handler);

    // Read and verify the signed session cookie
    app.get("/profile", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const session = req.signedCookie("session", SECRET) orelse {
                res.status(401).json(.{ .@"error" = "invalid or missing session" });
                return;
            };
            defer req.allocator().free(@constCast(session));

            res.json(.{ .sessionUser = session, .authenticated = true });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Example: Clear a Cookie (Logout)

```zig
// POST /logout
app.post("/logout", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        // The path MUST match the path used when the cookie was set
        res.clearCookie("session", .{ .path = "/" });
        res.json(.{ .message = "logged out" });
    }
}.handler);
```

## Example: Complete Login/Logout Flow

This example puts everything together: JSON login, signed session cookies, profile access, and logout.

```zig
const std = @import("std");
const ziez = @import("ziez");

const SESSION_SECRET = "super-secret-hmac-key-minimum-32-characters!!";

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.logging(.{ .level = .info });

    app.on_error(struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            const msg = res.error_message orelse info.message;
            res.status(info.code).json(.{ .@"error" = msg, .statusCode = info.code });
        }
    }.handler);

    // POST /login -- authenticate and set a signed session cookie
    app.post("/login", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const Creds = struct { username: []const u8, password: []const u8 };
            const creds = req.body_json(Creds) orelse
                return ziez.throw(error.BadRequest, "username and password required", res);

            if (!std.mem.eql(u8, creds.username, "admin") or
                !std.mem.eql(u8, creds.password, "secret"))
            {
                return ziez.throw(error.Unauthorized, "invalid credentials", res);
            }

            // Set a signed cookie that expires in 1 hour
            try res.setSignedCookie("session", "user:admin", .{
                .http_only = true,
                .same_site = .strict,
                .max_age = 3600,
                .path = "/",
            }, SESSION_SECRET);

            res.json(.{ .message = "logged in", .user = creds.username });
        }
    }.handler);

    // GET /profile -- verify signed cookie and return user info
    app.get("/profile", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const session = req.signedCookie("session", SESSION_SECRET) orelse
                return ziez.throw(error.Unauthorized, "missing or invalid session", res);
            defer req.allocator().free(@constCast(session));

            res.json(.{ .session = session, .authenticated = true });
        }
    }.handler);

    // GET /theme -- set a plain (unsigned) preference cookie
    app.get("/theme", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const theme = req.query_get("set") orelse "dark";
            res.setCookie("theme", theme, .{
                .path = "/",
                .max_age = 86400 * 30,
                .same_site = .lax,
            });
            res.json(.{ .message = "theme cookie set", .theme = theme });
        }
    }.handler);

    // GET /prefs -- read the theme cookie back
    app.get("/prefs", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const theme = req.cookie("theme") orelse "system";
            res.json(.{ .theme = theme });
        }
    }.handler);

    // POST /logout -- clear session cookie
    app.post("/logout", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.clearCookie("session", .{ .path = "/" });
            res.json(.{ .message = "logged out" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

Test the full flow:

```bash
# 1. Login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}'
# {"message":"logged in","user":"admin"}
# (Note the Set-Cookie header in the response)

# 2. Access profile with the signed cookie
curl -b "session=user%3Aadmin.a1b2c3d4..." http://localhost:3000/profile
# {"session":"user:admin","authenticated":true}

# 3. Set a theme preference
curl http://localhost:3000/theme?set=dark
# {"message":"theme cookie set","theme":"dark"}

# 4. Logout
curl -X POST http://localhost:3000/logout
# {"message":"logged out"}
```

## Important Notes

- **Always use `http_only = true` for session cookies.** This prevents JavaScript from reading the cookie, which protects against cross-site scripting (XSS) attacks stealing sessions.
- **Always use `secure = true` in production.** This ensures cookies are only sent over HTTPS, preventing network eavesdroppers from intercepting them.
- **The `path` must match between set and clear.** If you set a cookie with `.path = "/"`, you must clear it with `.path = "/"`. Mismatched paths mean the browser treats them as different cookies.
- **Keep your secret key long and random.** Use at least 32 characters. Never commit it to source control -- load it from an environment variable.
- **Plain cookies are not secure.** Users can see and modify them in their browser's developer tools. Use signed cookies for anything that must not be tampered with.
