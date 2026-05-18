# Middleware

Middleware functions intercept requests before they reach route handlers.

## Basic Middleware

```zig
app.use(struct {
    fn handler(req: *ziez.Request, _: *ziez.Response, next: *ziez.Next) void {
        std.debug.print("{s} {s}\n", .{ @tagName(req.method), req.path });
        next.call();
    }
}.handler);
```

## Middleware Flow

<div data-diagram="middleware-flow"></div>
