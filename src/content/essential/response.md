# Response

Think of the response as your reply letter to the client. You choose the envelope color (status code), attach labels (headers), and fill it with content (the body). The `Response` builder in ziez gives you a fluent, chainable API to construct every part of that reply.

## JSON Responses

`res.json()` serializes any Zig value to JSON and sends it with `Content-Type: application/json`. It uses a stack buffer for small payloads and falls back to heap allocation for larger ones.

You can chain `.status()` before `.json()` to set the HTTP status code.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // 200 OK with JSON body
    app.get("/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id = req.param("id") orelse return error.BadRequest;
            res.json(.{
                .id = id,
                .name = "Alice",
                .email = "alice@example.com",
            });
        }
    }.handler);

    // 201 Created
    app.post("/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.status(201).json(.{
                .id = "42",
                .created = true,
            });
        }
    }.handler);

    // 204 No Content
    app.delete("/users/:id", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.status(204).sendBody("");
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## HTML Responses

`res.html()` sends an HTML body with `Content-Type: text/html; charset=utf-8`.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.html(
                \\<!DOCTYPE html>
                \\<html>
                \\  <head><title>Welcome</title></head>
                \\  <body><h1>Hello from ziez!</h1></body>
                \\</html>
            );
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Serialization

`res.serialize()` and `res.serializeMany()` send JSON responses using ziez's comptime serializer with field filtering, transforms, computed fields, and groups. See the [Serialization](/patterns/serialization) guide for full details.

```zig
const std = @import("std");
const ziez = @import("ziez");

const User = struct {
    id: u32,
    name: []const u8,
    email: []const u8,
    password_hash: []const u8,
};

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/users/:id", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            const user = User{
                .id = 1,
                .name = "Alice",
                .email = "alice@example.com",
                .password_hash = "$2b$12$secret",
            };

            // Exclude password_hash from the response
            res.serialize(user, .{
                .exclude = &.{"password_hash"},
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Redirects

`res.redirect()` sends a `302 Found` response with a `Location` header.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/old-path", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.redirect("/new-path");
        }
    }.handler);

    // Permanent redirect (301)
    app.get("/legacy", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.status(301).set("location", "/modern").sendBody("");
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Headers

ziez provides several methods for manipulating response headers. All setter methods return `*Response` for chaining.

| Method                   | Description                                        |
|--------------------------|----------------------------------------------------|
| `set(key, val)`          | Add a header (allows duplicates)                   |
| `setHeader(key, val)`    | Alias for `set`                                    |
| `setOrReplaceHeader(k,v)`| Set a header, replacing any existing value         |
| `removeHeader(key)`      | Remove all headers with the given name             |
| `type_of(ct)`            | Shortcut for `set("content-type", ct)`             |

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/api/data", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.set("x-request-id", "abc-123");
            res.set("cache-control", "no-store");
            res.setOrReplaceHeader("cache-control", "max-age=3600");
            res.type_of("text/plain");
            res.send("Here is some data");
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

## Status Codes

`res.status(code)` sets the HTTP status code and returns `*Response` for chaining. Common status codes:

| Code | Constant                 | Meaning                      |
|------|--------------------------|------------------------------|
| 200  |                          | OK                           |
| 201  |                          | Created                      |
| 204  |                          | No Content                   |
| 301  |                          | Moved Permanently            |
| 302  |                          | Found (temporary redirect)   |
| 304  |                          | Not Modified                 |
| 400  | `error.BadRequest`       | Bad Request                  |
| 401  | `error.Unauthorized`     | Unauthorized                 |
| 403  | `error.Forbidden`        | Forbidden                    |
| 404  | `error.NotFound`         | Not Found                    |
| 409  | `error.Conflict`         | Conflict                     |
| 422  | `error.UnprocessableEntity` | Unprocessable Content     |
| 429  | `error.TooManyRequests`  | Too Many Requests            |
| 500  | `error.InternalServerError` | Internal Server Error     |

`res.sendStatus(code)` sets the status code and sends an empty body.

## Cookies

### setCookie

`res.setCookie(name, value, opts)` sets a cookie on the response. The `CookieOptions` struct controls cookie behavior:

| Field        | Type          | Default  | Description                                        |
|--------------|---------------|----------|----------------------------------------------------|
| `max_age`    | `?i64`        | `null`   | Cookie lifetime in seconds                         |
| `expires`    | `?[]const u8` | `null`   | Expiration date (RFC 1123 string)                  |
| `http_only`  | `bool`        | `false`  | Prevent JavaScript access                          |
| `secure`     | `bool`        | `false`  | Only send over HTTPS                               |
| `same_site`  | `?SameSite`   | `null`   | `Strict`, `Lax`, or `None`                         |
| `path`       | `?[]const u8` | `null`   | URL path prefix for the cookie                     |
| `domain`     | `?[]const u8` | `null`   | Domain the cookie is valid for                     |
| `partitioned`| `bool`        | `false`  | Enable CHIPS partitioned cookies                   |

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/set-preferences", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.setCookie("theme", "dark", .{
                .max_age = 365 * 24 * 3600, // 1 year
                .http_only = false,
                .secure = true,
                .same_site = .lax,
                .path = "/",
            });
            res.json(.{ .theme = "dark" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

### clearCookie

`res.clearCookie(name, opts)` removes a cookie by setting `Max-Age=0`. Pass the same `path` and `domain` you used when setting the cookie.

```zig
app.get("/logout", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        res.clearCookie("session", .{ .path = "/" });
        res.json(.{ .loggedOut = true });
    }
}.handler);
```

### setSignedCookie

`res.setSignedCookie(name, value, opts, secret)` sets a cookie whose value is signed with HMAC-SHA256. Use `req.signedCookie()` to read and verify it. See [Request - Signed Cookies](/essential/request#signed-cookies) for the reading side.

```zig
app.get("/login", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        try res.setSignedCookie(
            "session",
            "user_42",
            .{ .http_only = true, .secure = true, .same_site = .strict },
            "my-secret-key",
        );
        res.json(.{ .loggedIn = true });
    }
}.handler);
```

## Streaming Overview

ziez supports multiple streaming response types for real-time data delivery. See the [Streaming](/patterns/streaming) guide for full details.

| Method              | Content Type                    | Use Case                        |
|---------------------|---------------------------------|---------------------------------|
| `stream(ct, cb)`    | Custom                          | Generic streaming               |
| `streamNdjson(cb)`  | `application/x-ndjson`          | Log tailing, real-time feeds    |
| `streamSse(cb)`     | `text/event-stream`             | Browser push notifications      |
| `streamCsv(cfg, cb)`| `text/csv`                      | Report export                   |
| `streamJsonArray(cb)`| `application/json`             | Large JSON arrays               |
| `streamText(cb)`    | `text/plain`                    | Plain text streaming            |

## File Serving with streamFile

`res.streamFile(path, config)` serves a file from disk. It automatically infers the MIME type from the file extension, supports HTTP range requests for partial content (useful for video/audio streaming), and uses buffered reads for efficiency.

The `FileStreamConfig` struct:

| Field           | Type          | Default   | Description                         |
|-----------------|---------------|-----------|-------------------------------------|
| `content_type`  | `?[]const u8` | `null`    | Override MIME type (auto-detected)  |
| `download_name` | `?[]const u8` | `null`    | Trigger download with this filename |
| `buffer_size`   | `usize`       | `65536`   | Read buffer size in bytes           |

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Serve a file with auto-detected content type
    app.get("/download/report", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.streamFile("./data/report.pdf", .{
                .download_name = "annual-report.pdf",
            });
        }
    }.handler);

    // Serve a video with range request support
    app.get("/video/:name", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const name = req.param("name") orelse return error.BadRequest;
            const arena = req.arena();
            const path = try std.fmt.allocPrint(arena, "./videos/{s}.mp4", .{name});
            res.streamFile(path, .{});
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

When a client sends a `Range` header (e.g., `Range: bytes=0-1048575`), `streamFile` responds with `206 Partial Content` and the requested byte range. Without a `Range` header, the entire file is sent with a `Content-Length` header. If the range is invalid, a `416 Range Not Satisfiable` response is returned.

## Full CRUD Example

This example ties together JSON responses, status codes, headers, and cookies in a complete REST API for managing notes.

```zig
const std = @import("std");
const ziez = @import("ziez");

const Note = struct {
    id: u32,
    title: []const u8,
    body: []const u8,
};

var notes = std.ArrayList(Note).init(std.heap.smp_allocator);
var next_id: std.atomic.Value(u32) = .init(1);

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    const api = app.group("/api/notes");

    // List all notes — GET /api/notes
    api.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .notes = notes.items });
        }
    }.handler);

    // Get a single note — GET /api/notes/:id
    api.get("/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id_str = req.param("id") orelse return error.BadRequest;
            const id = std.fmt.parseInt(u32, id_str, 10) catch return error.BadRequest;

            for (notes.items) |note| {
                if (note.id == id) {
                    res.json(note);
                    return;
                }
            }
            return error.NotFound;
        }
    }.handler);

    // Create a note — POST /api/notes
    api.post("/", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const Input = struct { title: []const u8, body: []const u8 };
            const input = req.body_json(Input) orelse
                return ziez.throw(error.BadRequest, "title and body required", res);

            const note = Note{
                .id = next_id.fetchAdd(1, .monotonic),
                .title = input.title,
                .body = input.body,
            };
            try notes.append(note);

            res.set("x-resource-id", "note-created");
            res.status(201).json(note);
        }
    }.handler);

    // Delete a note — DELETE /api/notes/:id
    api.delete("/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id_str = req.param("id") orelse return error.BadRequest;
            const id = std.fmt.parseInt(u32, id_str, 10) catch return error.BadRequest;

            for (notes.items, 0..) |note, i| {
                if (note.id == id) {
                    _ = notes.orderedRemove(i);
                    res.status(204).sendBody("");
                    return;
                }
            }
            return error.NotFound;
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

Test the API:

```bash
# Create a note
curl -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"My Note","body":"Hello world"}'

# List notes
curl http://localhost:3000/api/notes

# Get note 1
curl http://localhost:3000/api/notes/1

# Delete note 1
curl -X DELETE http://localhost:3000/api/notes/1
```
