# Introduction

Declarative Zig web framework with comptime serialization, interceptor chains, and validation pipes.

## What is ziez?

ziez is an ergonomic web framework for building backend servers with Zig. Designed with simplicity and performance in mind, ziez offers a declarative API with extensive compile-time features optimized for Zig.

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

## Features

- **Comptime Serialization** — Declarative field exclusion, transforms, computed fields, and conditional serialization at compile time
- **Interceptor Chains** — Onion-style request/response interceptors with `proceed()` semantics
- **Validation Pipes** — Type-safe parameter parsing and body validation with schema support
- **Streaming** — SSE, NDJSON, CSV, JSON array, and plain text streaming
- **Plugin System** — Modular architecture with official plugins for CORS, compression, security, and more

## Requirements

- Zig 0.16.0+

## Architecture Overview

<div data-diagram="architecture"></div>
