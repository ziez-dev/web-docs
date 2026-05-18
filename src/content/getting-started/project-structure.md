# Project Structure

Overview of the ziez project layout.

```
├── build.zig            # Build configuration
├── build.zig.zon        # Package manifest
├── src/
│   ├── root.zig         # Public API re-exports
│   ├── app.zig          # App & server
│   ├── router.zig       # Route matching
│   ├── listener.zig     # HTTP server
│   ├── middleware.zig   # Middleware types
│   ├── request.zig      # Request struct
│   ├── response.zig     # Response builder
│   ├── interceptor.zig  # Interceptor system
│   ├── pipe.zig         # Validation pipes
│   ├── hook.zig         # Request hook system
│   ├── stream.zig       # Streaming writers
│   ├── logging.zig      # Structured JSON logger
│   ├── env.zig          # .env loader
│   ├── multipart/       # Multipart parser
│   ├── exceptions.zig   # HTTP errors
│   ├── validator/       # Validation framework
│   └── serializer/      # Declarative serialization
├── tests/               # Unit tests
└── examples/            # Example apps
```
