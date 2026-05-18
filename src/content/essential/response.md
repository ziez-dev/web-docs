# Response

The `Response` builder provides a fluent API for constructing HTTP responses.

## JSON Response

```zig
res.json(.{ .id = 1, .name = "Alice" });
res.status(201).json(.{ .created = true });
```

## HTML Response

```zig
res.html("<h1>Hello</h1>");
```

## Redirects

```zig
res.redirect("/new-path");
```

## Headers

```zig
res.set("content-type", "text/plain");
res.sendBody("raw bytes");
```
