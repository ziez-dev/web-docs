# Quick Start

Get up and running with ziez in under 5 minutes.

## Installation

Add ziez to your project's `build.zig.zon`:

```zig
.dependencies = .{
    .ziez = .{
        .url = "https://github.com/ziez-dev/ziez/archive/refs/tags/v0.0.1.tar.gz",
        .hash = "1220b1fe03d61a1cc83ee28e918e1a2e4f0e0d6d1e23844e0c0e28194a8bbbe9d2e8",
    },
},
```

## Build & Run

```bash
zig build run
```

Your server is now running at `localhost:3000`.
