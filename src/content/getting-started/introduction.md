# Introduction

Welcome to ziez -- a declarative web framework for Zig that turns HTTP requests into structured responses using the full power of compile-time metaprogramming. This page will walk you through what ziez is, why it exists, and how to get a server running in just a few lines of code.

---

## What is ziez?

Think of a web framework as a **factory**. Raw materials arrive at the loading dock (an HTTP request from a browser), the factory processes them through various stations (routing, validation, business logic), and a finished product leaves through the shipping bay (an HTTP response sent back to the client). A web framework is the machinery, conveyor belts, and quality-control systems that make this factory run efficiently so you can focus on what your factory actually *produces*.

ziez is that factory, purpose-built for Zig. It gives you:

- A **router** that maps URLs to handler functions
- **Request and Response** objects that abstract away raw HTTP parsing
- **Middleware and interceptors** for cross-cutting concerns like logging and authentication
- **Validation** to reject malformed input before it reaches your logic
- **Serialization** to control exactly what data leaves your API
- **Streaming** for real-time data delivery

### Why Zig?

Zig is a systems programming language that competes with C in performance while offering modern ergonomics. Two features make it especially powerful for web frameworks:

1. **Compile-time execution (comptime)** -- Zig can run arbitrary code at compile time. ziez uses this to generate serialization, validation, and routing logic *before your program ever starts*, meaning zero runtime reflection overhead.
2. **Memory safety without a garbage collector** -- Zig gives you explicit control over memory allocation with no hidden pauses, making it ideal for low-latency server workloads.

### The three pillars

ziez is built around three core ideas that work together:

1. **Comptime Serialization** -- Define how your data structures are transformed into JSON responses using a declarative configuration, evaluated entirely at compile time. Think of it like applying an Instagram filter to your data: the original struct stays intact, but the output only shows what you want the world to see.

2. **Interceptor Chains** -- Wrap your handlers in composable layers of logic that run before and after the handler, like a series of security checkpoints at an airport. Each checkpoint can inspect the request, modify it, reject it, or let it through to the next station.

3. **Validation Pipes** -- Parse and validate incoming data (URL parameters, query strings, JSON bodies) with type-safe transformations, like airport baggage check that X-rays every bag before it boards. Invalid data is rejected before it ever reaches your handler.

---

## Hello World

Here is a complete, runnable ziez application. It starts an HTTP server on port 3000 that responds to `GET /` with a JSON message.

```zig
const std = @import("std");
const ziez = @import("ziez");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .message = "hello from ziez!" });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

Save this as `src/main.zig`, then run it:

```bash
zig build run
```

Open your browser at `http://localhost:3000` and you will see:

```json
{ "message": "hello from ziez!" }
```

### Line-by-line explanation

Let us walk through every line so nothing is left to guesswork.

---

**`const std = @import("std");`**

This imports Zig's standard library. The standard library provides essentials like memory allocators, printing, and data structures. We need it for the allocator on the next line.

---

**`const ziez = @import("ziez");`**

This imports the ziez framework. In Zig, `@import` makes an external package available. For this to work, your `build.zig` must add ziez as a dependency (see the [Quick Start](/getting-started/quick-start) page for setup instructions).

---

**`pub fn main() !void {`**

This is your program's entry point. The `!void` return type is a Zig **error union** -- it means "this function returns either `void` (success, no value) or an error." If anything inside the function fails (for example, the server cannot bind to the port), the error propagates up automatically. This is Zig's primary error-handling mechanism: explicit, visible, and zero-cost.

---

**`const allocator = std.heap.smp_allocator;`**

An **allocator** is how Zig manages memory. Unlike languages with a garbage collector, Zig requires you to explicitly state where memory comes from. `std.heap.smp_allocator` is a general-purpose allocator provided by the standard library that is safe to use in most programs. Every part of ziez that needs to allocate memory (parsing requests, building responses, etc.) accepts an allocator, so you always control the memory strategy.

---

**`var app = ziez.init(allocator);`**

This creates your application instance. `ziez.init()` is a convenience function that constructs a new `App` value, passing it the allocator. The `App` is the central object that holds your routes, middleware, interceptors, and server configuration. We use `var` (not `const`) because we will mutate it by registering routes.

---

**`defer app.deinit();`**

`defer` is a Zig keyword that schedules a cleanup action to run when the current scope exits. Here, `app.deinit()` will be called when `main()` returns, ensuring all resources held by the app (memory, connections, etc.) are properly released. Think of it as a guaranteed "finally" block -- it runs no matter how the function exits, whether successfully or with an error.

---

**`app.get("/", struct { ... }.handler);`**

This registers a **route handler** for `GET /`. Let us break it down piece by piece:

- `app.get(...)` -- registers a handler for HTTP GET requests. ziez also provides `app.post()`, `app.put()`, `app.patch()`, `app.delete()`, and `app.all()` for other HTTP methods.

- `struct { fn handler(...) { ... } }.handler` -- This is **Zig's way of passing a compile-time function reference**. Zig does not have first-class functions or closures in the traditional sense. Instead, you declare an anonymous struct that contains a function, then pass a reference to that function using `.handler`. The function itself is evaluated at compile time, which allows ziez to inspect its signature and generate optimized dispatch code.

  If you are coming from JavaScript, think of this as the equivalent of passing `(req, res) => { ... }` to `app.get()` -- but instead of a runtime lambda, it is a comptime function reference.

- `_: *ziez.Request` -- the first parameter is a pointer to the incoming HTTP request. The underscore `_` means "I am not using this parameter," which avoids an unused-variable warning. The `*` means it is a pointer -- you receive a reference to the request, not a copy.

- `res: *ziez.Response` -- the second parameter is a pointer to the response builder. You call methods on this object to set the status code, headers, and body.

- `!void` -- the handler itself can also return errors. If your handler returns an error, ziez catches it and invokes your error handler (or a default one).

---

**`res.json(.{ .message = "hello from ziez!" });`**

This sends a JSON response. The `.{ ... }` syntax creates a Zig **anonymous struct** -- a struct type that is inferred from the values you provide. ziez automatically serializes this struct to JSON at compile time, producing `{"message":"hello from ziez!"}`. This is one of the places where Zig's comptime really shines: there is no runtime reflection, no string-keyed maps, just direct struct-to-JSON code generation.

---

**`try app.listen("0.0.0.0:3000");`**

This starts the HTTP server, binding to all network interfaces (`0.0.0.0`) on port `3000`. The `try` keyword is Zig's error propagation -- if the server fails to start (for example, the port is already in use), the error is returned from `main()` immediately. Once this line executes, the server runs indefinitely, accepting and processing incoming connections.

---

## Key Features

Here is an overview of everything ziez provides. Each feature links to its dedicated documentation page where you can dive deeper.

### Comptime Serialization

Control exactly which fields from your structs appear in API responses. Exclude sensitive fields like passwords, omit null values, apply per-field transformations, add computed virtual fields, and define named groups of fields for different contexts. All configuration is evaluated at compile time, producing zero-overhead serialization code.

Think of it like an **Instagram filter for your data**: the original struct stays intact in your code, but the serialized output only shows what you want the outside world to see.

Read more: [Serialization](/patterns/serialization)

### Interceptor Chains

Interceptors are composable middleware layers that wrap your handlers in an onion pattern. Each interceptor can run logic before the handler, call `ctx.proceed()` to pass control to the next layer, and then run logic after the handler returns. This makes them ideal for cross-cutting concerns like timing, logging, authentication, and rate limiting.

Think of them like **security checkpoints at an airport**: each checkpoint inspects you, possibly stamps your passport, and waves you through to the next one. On the way back, they process you in reverse order.

Read more: [Interceptors](/patterns/interceptors)

### Validation Pipes

Validation pipes parse and validate incoming data before it reaches your handler. Parse URL parameters as integers, validate UUIDs, check JSON bodies against schemas, and transform data types -- all with compile-time type safety. Invalid input is rejected automatically with appropriate error responses.

Think of them like **airport baggage check**: every bag is X-rayed before it boards. If something is wrong, it is caught and rejected before it ever reaches the plane.

Read more: [Validation](/patterns/validation) and [Schema Validation](/patterns/schema-validation)

### Streaming

Send data to clients in real time using streaming responses. ziez supports five streaming formats out of the box:

- **NDJSON** -- Newline-delimited JSON, ideal for event streams and data pipelines
- **SSE** -- Server-Sent Events, the standard for pushing updates from server to browser
- **CSV** -- Comma-separated values with BOM support, for data exports
- **JSON Array** -- A streaming JSON array where items are written one at a time
- **Plain Text** -- Raw chunked text streaming for maximum flexibility

Read more: [Streaming](/patterns/streaming)

### Structured Logging

Built-in structured JSON logger with log levels (trace, debug, info, warn, error, fatal), field redaction for sensitive data like authorization headers, and pluggable custom sinks. Create child loggers with persistent contextual fields for request tracing.

Read more: [Logging](/patterns/logging)

### Environment Variables

Load configuration from `.env` files with type-safe accessors. Read strings, integers, booleans, and optional values with sensible defaults -- no manual string parsing required.

Read more: [Environment Variables](/patterns/environment)

### Cookie Management

Set and read HTTP cookies with full option support (path, domain, max age, secure, HttpOnly, SameSite). Sign cookies with HMAC-SHA256 to prevent tampering, and verify signatures on read.

Read more: [Cookies](/patterns/cookies)

### Plugin System

Extend ziez with official plugins for common needs:

| Plugin | Description |
|---|---|
| [ziez-cors](https://github.com/ziez-dev/cors) | CORS middleware with origin whitelist and predicates |
| [ziez-compression](https://github.com/ziez-dev/compression) | gzip, deflate, and brotli response compression |
| [ziez-security](https://github.com/ziez-dev/security) | Security headers and XSS protection |
| [ziez-static](https://github.com/ziez-dev/static) | Static file serving |
| [ziez-template](https://github.com/ziez-dev/template) | Template engine with layouts and caching |
| [ziez-tls](https://github.com/ziez-dev/tls) | TLS/HTTPS with automatic HTTP-to-HTTPS redirect |
| [ziez-tracker](https://github.com/ziez-dev/tracker) | Request logging with User-Agent parsing |

Plugins use ziez's public hook and middleware APIs, so you can also write your own. See the [plugin overview](/plugins/overview) for details.

---

## Requirements

Before you start, make sure you have the following:

- **Zig 0.16.0 or later** -- ziez uses language features and standard library APIs that are not available in older versions. You can check your Zig version by running `zig version` in your terminal. Download the latest release from [ziglang.org](https://ziglang.org/download/).

- **Basic Zig knowledge** -- You should be comfortable with the following Zig concepts before working through this documentation:
  - **Functions** -- defining and calling functions, including public functions
  - **Structs** -- creating struct types, accessing fields, methods
  - **Error unions** -- the `!Type` syntax, `try`, `catch`, and error propagation
  - **Allocators** -- the concept of passing an allocator to functions that need memory

If you are new to Zig, the [official Zig guide](https://ziglearn.org/) is an excellent starting point.

---

## Architecture

The diagram below shows how a request flows through the ziez framework from arrival to response:

<div data-diagram="architecture"></div>

### Request lifecycle

Here is what happens when an HTTP request arrives at your ziez server:

1. **Request** -- The HTTP listener accepts an incoming connection and parses the raw bytes into a `ziez.Request` object containing the method, path, headers, query parameters, and body.

2. **Hooks** -- Pre-processing hooks run first. These are plugin-level entry points (used by CORS, compression, security headers, etc.) that can inspect and modify the request before routing begins.

3. **Middleware Chain** -- Global middleware registered with `app.use()` executes in registration order. Each middleware receives the request, response, and a `next` callback. Calling `next.call()` passes control to the next middleware. This is where you add request logging, authentication checks, and other cross-cutting logic.

4. **Router** -- The router matches the request path against your registered routes in two passes:
   - **Exact match** -- A hash map lookup for paths without parameters (e.g., `/health`, `/api/status`). This is O(1) and very fast.
   - **Parameterized scan** -- A linear scan for routes with named parameters or wildcards (e.g., `/users/:id`, `/*`). The first match wins.

5. **Handler** -- Your route handler function runs. It receives the `Request` and `Response` pointers and contains your business logic. It can read from the request, query a database, call external services, and write to the response.

6. **Response** -- The `Response` object is serialized and sent back over the connection. If the handler returned an error, ziez invokes the error handler instead, which formats an appropriate error response.

This layered design means you can plug in logic at every stage of the request lifecycle without modifying your handlers. Middleware handles cross-cutting concerns, interceptors wrap handlers with before/after logic, validation pipes guard input, and serialization controls output -- all composable, all comptime-optimized.

---

Ready to build something? Head to the [Quick Start](/getting-started/quick-start) page to set up your first ziez project.
