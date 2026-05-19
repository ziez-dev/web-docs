# Streaming

SSE, NDJSON, CSV, JSON array, and plain text streaming support.

Think of streaming like a **water tap**. Instead of waiting for the entire bathtub to fill before you get any water (a complete response buffered in memory), you open the tap and use the water as it flows -- data is sent little by little, in chunks, as soon as it is ready.

This matters when your data is large or arrives over time: live notifications, large database exports, real-time logs. With streaming, the client starts receiving data immediately instead of waiting for the server to build the entire response first.

---

## When to Use Streaming

| Use case | Streaming type | Why |
|---|---|---|
| Large dataset export | CSV, JSON array, NDJSON | Avoid buffering thousands of rows in memory |
| Real-time notifications | SSE | Push events to the browser as they happen |
| Live updates (feeds, logs) | NDJSON, SSE | Send entries as they become available |
| File downloads | File streaming | Support range requests, avoid loading the whole file |
| Progress updates | Text stream | Send status messages as work progresses |

---

## Stream Basics

All streaming in ziez starts with a response method that opens a streaming connection and gives you a writer. You write data in chunks inside a callback, and the framework handles flushing and connection management.

The base writer is `ziez.StreamWriter`, which provides:

| Method | What it does |
|---|---|
| `write(data)` | Write raw bytes |
| `print(fmt, args)` | Write formatted text |
| `flush()` | Flush the buffer to the client |
| `end()` | Signal the stream is finished |

---

## NDJSON Streaming

**NDJSON** (Newline-Delimited JSON) is a format where each line is a complete, independent JSON object. It is simple, human-readable, and easy to parse on the client side because you just split on newlines.

### When to use

- Streaming database rows or search results
- Real-time data feeds where each entry is independent
- APIs consumed by other servers (not browsers)

### How to use

```zig
res.streamNdjson(callback);
```

The callback receives a `*ziez.NdjsonStreamWriter` with:

| Method | What it does |
|---|---|
| `writeObject(data)` | Serialize any value as JSON, write it, append newline, flush |
| `end()` | Signal the stream is finished |

### Example

```zig
var counter: i32 = 0;

app.get("/stream/ndjson", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        counter = 0;
        res.streamNdjson(ndjsonHandler);
    }
    fn ndjsonHandler(sw: *ziez.NdjsonStreamWriter) anyerror!void {
        while (counter < 5) {
            try sw.writeObject(.{
                .index = counter,
                .message = "hello",
            });
            counter += 1;
        }
    }
}.handler);
```

Output (each line sent immediately as it is written):

```
{"index":0,"message":"hello"}
{"index":1,"message":"hello"}
{"index":2,"message":"hello"}
{"index":3,"message":"hello"}
{"index":4,"message":"hello"}
```

Client-side parsing:

```javascript
// Browser
const response = await fetch("/stream/ndjson");
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
        if (line) console.log(JSON.parse(line));
    }
}
```

---

## Server-Sent Events (SSE)

**SSE** is a browser-native protocol for the server to push events to the client over a single long-lived HTTP connection. The browser provides the `EventSource` API to consume it.

### When to use

- Real-time notifications in a web UI
- Live scoreboards, stock tickers, dashboards
- Any scenario where the server pushes updates to the browser

### How it works

When you call `res.streamSse()`, ziez automatically sets:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (for nginx proxies)

The client connects using the browser's built-in `EventSource` API.

### API

```zig
res.streamSse(callback);
```

The callback receives a `*ziez.SseStreamWriter` with:

| Method | What it does |
|---|---|
| `setEvent(name)` | Set the event type name |
| `setData(data)` | Set the event data (multiline data is handled correctly) |
| `setId(id)` | Set the event ID (for reconnection) |
| `setRetry(ms)` | Set reconnection interval in milliseconds |
| `comment(text)` | Send a comment (ignored by clients, useful for keep-alive) |
| `end()` | Signal the stream is finished |

### Example

```zig
var sse_counter: u32 = 0;

app.get("/stream/sse", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        sse_counter = 0;
        res.streamSse(sseHandler);
    }
    fn sseHandler(sw: *ziez.SseStreamWriter) anyerror!void {
        try sw.setEvent("message");
        while (sse_counter < 5) {
            const msg = std.fmt.allocPrint(sw.inner.allocator, "event #{d}", .{sse_counter}) catch "msg";
            try sw.setData(msg);
            try sw.setId(std.fmt.allocPrint(sw.inner.allocator, "{d}", .{sse_counter}) catch "0");
            sse_counter += 1;
        }
        try sw.setData("[DONE]");
    }
}.handler);
```

Client-side:

```javascript
const source = new EventSource("/stream/sse");

source.addEventListener("message", (event) => {
    console.log(event.data); // "event #0", "event #1", ..., "[DONE]"
    if (event.data === "[DONE]") {
        source.close();
    }
});

source.onerror = () => {
    console.log("Connection lost, browser will auto-reconnect");
};
```

---

## CSV Streaming

Stream CSV data row by row. Handles quoting and escaping per RFC 4180, and optionally writes a BOM for Excel compatibility.

### When to use

- Exporting large datasets as spreadsheets
- Data dumps that need to open correctly in Excel, Google Sheets, or Numbers

### Configuration

```zig
const ziez.CsvStreamConfig = struct {
    delimiter: u8 = ',',      // field separator (comma by default)
    quote: u8 = '"',          // quote character
    write_bom: bool = false,  // write UTF-8 BOM for Excel compatibility
};
```

### API

```zig
res.streamCsv(config, callback);
```

The callback receives a `*ziez.CsvStreamWriter` with:

| Method | What it does |
|---|---|
| `writeRow(fields)` | Write a row given a slice of string fields |
| `end()` | Signal the stream is finished |

Fields containing commas, quotes, or newlines are automatically quoted and escaped per RFC 4180.

### Example

```zig
app.get("/stream/csv", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        res.streamCsv(.{ .write_bom = true }, csvHandler);
    }
    fn csvHandler(sw: *ziez.CsvStreamWriter) anyerror!void {
        // Header row
        try sw.writeRow(&.{"ID", "Name", "Email"});

        // Data rows
        const users = [_][]const u8{
            "1",  "Alice", "alice@example.com",
            "2",  "Bob",   "bob@example.com",
            "3",  "Carol", "carol@example.com",
        };
        for (0..users.len / 3) |i| {
            const base = i * 3;
            try sw.writeRow(&.{ users[base], users[base + 1], users[base + 2] });
        }
    }
}.handler);
```

Output:

```csv
ID,Name,Email
1,Alice,alice@example.com
2,Bob,bob@example.com
3,Carol,carol@example.com
```

---

## JSON Array Streaming

Stream a JSON array item by item. The output is a valid JSON array -- the opening `[` is written on the first item, commas are inserted between items, and the closing `]` is written when `end()` is called.

### When to use

- APIs that need to return valid JSON arrays
- Paginated data that should start sending before all pages are loaded

### API

```zig
res.streamJsonArray(callback);
```

The callback receives a `*ziez.JsonArrayStreamWriter` with:

| Method | What it does |
|---|---|
| `writeItem(data)` | Serialize and write one array item |
| `end()` | Close the array and finish the stream |

### Example

```zig
app.get("/stream/json-array", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        res.streamJsonArray(jsonArrayHandler);
    }
    fn jsonArrayHandler(sw: *ziez.JsonArrayStreamWriter) anyerror!void {
        var i: i32 = 0;
        while (i < 5) {
            try sw.writeItem(.{
                .id = i,
                .name = "item",
                .active = true,
            });
            i += 1;
        }
    }
}.handler);
```

Output:

```json
[{"id":0,"name":"item","active":true},{"id":1,"name":"item","active":true},{"id":2,"name":"item","active":true},{"id":3,"name":"item","active":true},{"id":4,"name":"item","active":true}]
```

---

## Plain Text Streaming

Stream raw text data. Uses the base `StreamWriter` directly.

### Example

```zig
app.get("/stream/text", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response) !void {
        res.streamText(textHandler);
    }
    fn textHandler(sw: *ziez.StreamWriter) anyerror!void {
        var i: i32 = 0;
        while (i < 5) {
            const line = std.fmt.allocPrint(sw.allocator, "chunk {d}\n", .{i}) catch "chunk\n";
            try sw.write(line);
            try sw.flush();
            i += 1;
        }
    }
}.handler);
```

---

## Generic Streaming

For full control over content type, use `res.stream()` directly:

```zig
res.stream("application/octet-stream", struct {
    fn handler(sw: *ziez.StreamWriter) anyerror!void {
        try sw.write("binary data here");
        try sw.flush();
    }
}.handler);
```

---

## File Streaming

Stream a file from disk with automatic MIME type detection and HTTP range request support.

### Configuration

```zig
const ziez.FileStreamConfig = struct {
    content_type: ?[]const u8 = null,       // auto-detected if null
    download_name: ?[]const u8 = null,       // triggers "attachment" download
    buffer_size: usize = 65536,              // read buffer size
};
```

### Features

- **MIME type auto-detection** based on file extension (`.html`, `.css`, `.js`, `.json`, `.png`, `.jpg`, `.pdf`, `.zip`, and many more)
- **Range request support** (RFC 7233) -- clients can request partial content with the `Range` header, and ziez responds with `206 Partial Content`
- **Content-Disposition header** when `download_name` is set, triggering a browser download

### Example

```zig
// Stream a PDF with auto-detected MIME type
app.get("/download/:file", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const filename = req.param("file") orelse return error.BadRequest;
        var buf: [256]u8 = undefined;
        const path = std.fmt.bufPrint(&buf, "uploads/{s}", .{filename}) catch return error.BadRequest;
        res.streamFile(path, .{
            .download_name = filename,
        });
    }
}.handler);
```

---

## Complete Example

All streaming types in a single server:

```zig
const std = @import("std");
const ziez = @import("ziez");

var ndjson_counter: i32 = 0;
var sse_counter: u32 = 0;

pub fn main() !void {
    const allocator = std.heap.smp_allocator;
    var app = ziez.init(allocator);
    defer app.deinit();

    app.on_error(struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            const msg = res.error_message orelse info.message;
            res.status(info.code).json(.{ .statusCode = info.code, .@"error" = msg });
        }
    }.handler);

    // GET /stream/ndjson -- NDJSON streaming
    app.get("/stream/ndjson", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            ndjson_counter = 0;
            res.streamNdjson(ndjsonHandler);
        }
        fn ndjsonHandler(sw: *ziez.NdjsonStreamWriter) anyerror!void {
            while (ndjson_counter < 5) {
                try sw.writeObject(.{
                    .index = ndjson_counter,
                    .message = "hello",
                });
                ndjson_counter += 1;
            }
        }
    }.handler);

    // GET /stream/sse -- Server-Sent Events
    app.get("/stream/sse", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            sse_counter = 0;
            res.streamSse(sseHandler);
        }
        fn sseHandler(sw: *ziez.SseStreamWriter) anyerror!void {
            try sw.setEvent("message");
            while (sse_counter < 5) {
                const msg = std.fmt.allocPrint(sw.inner.allocator, "event #{d}", .{sse_counter}) catch "msg";
                try sw.setData(msg);
                try sw.setId(std.fmt.allocPrint(sw.inner.allocator, "{d}", .{sse_counter}) catch "0");
                sse_counter += 1;
            }
            try sw.setData("[DONE]");
        }
    }.handler);

    // GET /stream/csv -- CSV streaming
    app.get("/stream/csv", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.streamCsv(.{ .write_bom = true }, csvHandler);
        }
        fn csvHandler(sw: *ziez.CsvStreamWriter) anyerror!void {
            try sw.writeRow(&.{"ID", "Name", "Email"});
            const users = [_][]const u8{
                "1",  "Alice", "alice@example.com",
                "2",  "Bob",   "bob@example.com",
                "3",  "Carol", "carol@example.com",
            };
            for (0..users.len / 3) |i| {
                const base = i * 3;
                try sw.writeRow(&.{ users[base], users[base + 1], users[base + 2] });
            }
        }
    }.handler);

    // GET /stream/json-array -- JSON array streaming
    app.get("/stream/json-array", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.streamJsonArray(jsonArrayHandler);
        }
        fn jsonArrayHandler(sw: *ziez.JsonArrayStreamWriter) anyerror!void {
            var i: i32 = 0;
            while (i < 5) {
                try sw.writeItem(.{
                    .id = i,
                    .name = "item",
                    .active = true,
                });
                i += 1;
            }
        }
    }.handler);

    // GET /stream/text -- plain text streaming
    app.get("/stream/text", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.streamText(textHandler);
        }
        fn textHandler(sw: *ziez.StreamWriter) anyerror!void {
            var i: i32 = 0;
            while (i < 5) {
                const line = std.fmt.allocPrint(sw.allocator, "chunk {d}\n", .{i}) catch "chunk\n";
                try sw.write(line);
                try sw.flush();
                i += 1;
            }
        }
    }.handler);

    std.debug.print("Streaming server listening on http://0.0.0.0:3000\n", .{});
    std.debug.print("Endpoints:\n", .{});
    std.debug.print("  curl -N http://localhost:3000/stream/ndjson\n", .{});
    std.debug.print("  curl -N http://localhost:3000/stream/sse\n", .{});
    std.debug.print("  curl -N http://localhost:3000/stream/csv\n", .{});
    std.debug.print("  curl -N http://localhost:3000/stream/json-array\n", .{});
    std.debug.print("  curl -N http://localhost:3000/stream/text\n", .{});

    app.listen("0.0.0.0:3000") catch |e| {
        std.debug.print("server error: {s}\n", .{@errorName(e)});
    };
}
```

Test with `curl -N` (the `-N` flag disables buffering so you see data as it arrives):

```bash
curl -N http://localhost:3000/stream/ndjson
curl -N http://localhost:3000/stream/sse
curl -N http://localhost:3000/stream/csv
curl -N http://localhost:3000/stream/json-array
curl -N http://localhost:3000/stream/text
```

---

## Streaming API Quick Reference

| Method | Content-Type | Writer type | Key method |
|---|---|---|---|
| `res.streamNdjson(cb)` | `application/x-ndjson` | `NdjsonStreamWriter` | `writeObject(data)` |
| `res.streamSse(cb)` | `text/event-stream` | `SseStreamWriter` | `setEvent()`, `setData()` |
| `res.streamCsv(config, cb)` | `text/csv; charset=utf-8` | `CsvStreamWriter` | `writeRow(fields)` |
| `res.streamJsonArray(cb)` | `application/json` | `JsonArrayStreamWriter` | `writeItem(data)` |
| `res.streamText(cb)` | `text/plain; charset=utf-8` | `StreamWriter` | `write(data)` |
| `res.stream(content_type, cb)` | Custom | `StreamWriter` | `write(data)` |
| `res.streamFile(path, config)` | Auto-detected | -- | -- |
