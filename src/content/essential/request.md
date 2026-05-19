# Request

Think of an HTTP request as a letter a client sends to your server. The envelope has a delivery address (the URL), a letter type (the HTTP method), and possibly some enclosed documents (the body). The `Request` struct in ziez is your assistant that opens the envelope, reads the address, and hands you every piece of information inside -- neatly organized and ready to use.

## Properties

The `Request` struct exposes the following fields directly:

| Property      | Type                    | Description                                      |
|---------------|-------------------------|--------------------------------------------------|
| `method`      | `HttpMethod`            | The HTTP method (`GET`, `POST`, `PUT`, etc.)     |
| `path`        | `[]const u8`            | The URL path (e.g. `/users/42`)                  |
| `query`       | `QueryParams`           | Parsed query string key-value pairs              |
| `params`      | `Params`                | Named route parameters (`:id`, etc.)             |
| `body_raw`    | `[]const u8`            | The raw request body as bytes                    |
| `request_id`  | `[]const u8`            | Unique request identifier                        |
| `tls`         | `bool`                  | Whether the connection uses TLS                  |
| `tls_version` | `?[]const u8`           | Negotiated TLS version (e.g. `"TLSv1.3"`)        |
| `allocator`   | `std.mem.Allocator`     | Per-request arena allocator                      |

## Reading Route Parameters

Use `req.param()` to retrieve named parameters extracted from the URL by the router.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/users/:userId/posts/:postId", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const user_id = req.param("userId") orelse return error.BadRequest;
            const post_id = req.param("postId") orelse return error.BadRequest;

            res.json(.{
                .userId = user_id,
                .postId = post_id,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

A request to `GET /users/42/posts/7` returns:

```json
{ "userId": "42", "postId": "7" }
```

`req.param()` returns `?[]const u8` -- use `.orelse` or `if` to handle the optional.

## Reading Query Parameters

Use `req.query_get()` to read values from the query string. For the URL `/search?q=zig&page=2`, `req.query_get("q")` returns `"zig"` and `req.query_get("page")` returns `"2"`.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // GET /search?q=ziez&limit=10
    app.get("/search", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const query = req.query_get("q") orelse return error.BadRequest;
            const limit_str = req.query_get("limit") orelse "10";

            const limit = std.fmt.parseInt(u32, limit_str, 10) catch 10;

            res.json(.{
                .query = query,
                .limit = limit,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

You can also access all query parameters at once through `req.query`, which is a `QueryParams` struct supporting up to 32 entries with a `.get()` method.

## Reading Headers

Use `req.header()` to read any request header by name. Header lookup is case-insensitive.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/inspect", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const content_type = req.header("content-type");
            const user_agent = req.header("user-agent");
            const accept = req.header("accept");

            res.json(.{
                .contentType = content_type,
                .userAgent = user_agent,
                .accept = accept,
                .requestId = req.request_id,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

`req.header()` returns `?[]const u8`. It scans the raw head buffer using Zig's `HeaderIterator`, so it works without any prior header parsing overhead.

## Parsing JSON Bodies

Use `req.body_json(T)` to parse the request body into a Zig struct. The type `T` is inferred at compile time, giving you full type safety. If the body is empty or the JSON does not match the struct, `null` is returned.

```zig
const std = @import("std");
const ziez = @import("ziez");

const CreateUser = struct {
    name: []const u8,
    email: []const u8,
    age: ?u32 = null,
};

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.post("/users", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const user = req.body_json(CreateUser) orelse
                return ziez.throw(error.BadRequest, "Invalid JSON body", res);

            res.status(201).json(.{
                .name = user.name,
                .email = user.email,
                .age = user.age,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

Send a request:

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","age":30}'
```

Response:

```json
{ "name": "Alice", "email": "alice@example.com", "age": 30 }
```

The optional `age` field defaults to `null` when omitted from the JSON. All allocations made during parsing use the per-request arena and are freed automatically.

## Parsing Form Data

Use `req.body_form()` to parse URL-encoded form bodies (`application/x-www-form-urlencoded`). It returns a `FormParams` struct with a `.get()` method.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.post("/login", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const form = req.body_form();

            const username = form.get("username") orelse
                return ziez.throw(error.BadRequest, "username is required", res);
            const password = form.get("password") orelse
                return ziez.throw(error.BadRequest, "password is required", res);

            // In a real app, verify credentials against a database
            const valid = std.mem.eql(u8, username, "admin") and
                std.mem.eql(u8, password, "secret");

            if (!valid) return error.Unauthorized;

            res.json(.{ .message = "logged in", .user = username });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

```bash
curl -X POST http://localhost:3000/login \
  -d "username=admin&password=secret"
```

## File Uploads with saveMultipart

Use `req.saveMultipart(config)` to handle `multipart/form-data` uploads. It parses the body, validates file types, and saves files to disk. Think of it as a mailroom clerk who checks the package type, verifies the contents, and puts each item in the right cabinet.

The `UploadConfig` struct controls upload behavior:

| Field           | Type              | Default          | Description                                  |
|-----------------|-------------------|------------------|----------------------------------------------|
| `root_dir`      | `[]const u8`      | (required)       | Directory where files are saved              |
| `subdir`        | `?[]const u8`     | `null`           | Subdirectory within `root_dir`               |
| `max_body_size` | `usize`           | `52428800` (50MB)| Maximum total request body size              |
| `max_file_size` | `usize`           | `10485760` (10MB)| Maximum size per individual file             |
| `max_files`     | `usize`           | `1`              | Maximum number of files allowed              |
| `allowed_types` | `[]const []const u8` | `&.{}`        | Allowed MIME types. Supports wildcards like `"image/*"` |
| `file_fields`   | `[]const []const u8` | `&.{}`        | Expected file field names. Empty = accept any |
| `chunk_size`    | `usize`           | `8192`           | Buffer size for reading chunks               |

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.post("/upload", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            var upload = try req.saveMultipart(.{
                .root_dir = "./uploads",
                .subdir = "images",
                .max_file_size = 5 * 1024 * 1024, // 5 MB per file
                .max_files = 3,
                .allowed_types = &.{
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                },
                .file_fields = &.{"photo"},
            });
            defer upload.deinit();

            // Access text form fields
            const caption = upload.getField("caption");

            // Access the uploaded file
            if (upload.getFile("photo")) |file| {
                res.status(201).json(.{
                    .originalName = file.original_name,
                    .savedPath = file.path,
                    .size = file.size,
                    .contentType = file.content_type,
                    .caption = caption,
                });
            } else {
                return ziez.throw(error.BadRequest, "photo field is required", res);
            }
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

```bash
curl -X POST http://localhost:3000/upload \
  -F "photo=@portrait.png" \
  -F "caption=My profile picture"
```

The returned `MultipartUpload` provides:

- `.getField(name)` -- get a text field value
- `.getFile(name)` -- get file metadata (original name, saved path, size, content type)
- `.countFiles(name)` -- count files uploaded under a given field name
- `.deinit()` -- frees all resources and allocations

## Reading Cookies

Use `req.cookie()` to read a cookie by name. Cookies are lazily parsed on first access.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/greet", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const name = req.cookie("username") orelse "stranger";
            res.json(.{ .greeting = "Hello, " ++ name ++ "!" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Signed Cookies

Use `req.signedCookie()` to read and verify a cookie that was set with `res.setSignedCookie()`. The cookie value is verified using HMAC-SHA256 against your secret. If the cookie was tampered with, `null` is returned.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Set a signed cookie
    app.get("/login", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            try res.setSignedCookie(
                "session",
                "user_42",
                .{ .http_only = true, .secure = true },
                "my-secret-key",
            );
            res.json(.{ .loggedIn = true });
        }
    }.handler);

    // Read and verify the signed cookie
    app.get("/profile", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const session = req.signedCookie("session", "my-secret-key") orelse {
                res.status(401).json(.{ .@"error" = "Invalid or missing session" });
                return;
            };
            defer req.allocator().free(@constCast(session));
            res.json(.{ .sessionUser = session });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

The value returned by `signedCookie()` is allocated by the request arena and must be freed by the caller.

## Connection Information

Use `req.isSecure()` and `req.scheme()` to check whether the connection is encrypted. These are useful when building logic that depends on TLS state.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/info", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{
                .method = @tagName(req.method),
                .path = req.path,
                .secure = req.isSecure(),
                .scheme = req.scheme(),
                .tlsVersion = req.tls_version,
                .requestId = req.request_id,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

When accessed over HTTPS (using the `ziez-tls` plugin), `req.isSecure()` returns `true`, `req.scheme()` returns `"https"`, and `req.tls_version` might be `"TLSv1.3"`.

## Arena Allocator

Each request has a per-request arena allocator accessible via `req.arena()`. All allocations made through this allocator are automatically freed when the request completes. This is the same allocator used internally by `body_json()` and other parsing methods.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/demo", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const arena = req.arena();

            // Allocate a string -- freed automatically at end of request
            const greeting = try std.fmt.allocPrint(arena, "Hello, {s}!", .{
                req.query_get("name") orelse "world",
            });

            res.json(.{ .greeting = greeting });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```
