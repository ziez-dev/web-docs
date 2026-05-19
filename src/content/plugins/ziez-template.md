# Template Plugin

Server-side HTML rendering with layouts, caching, and a simple `{{variable}}` syntax.

---

## What is server-side template rendering?

Imagine you are writing form letters for a mailing campaign. You have a template that says "Dear {{name}}, thank you for your purchase of {{product}} on {{date}}." For each customer, you fill in the blanks and send the result. You never write each letter from scratch -- you write the template once and reuse it with different data.

Server-side template rendering works exactly the same way. Your HTML files contain placeholder markers like `{{title}}` or `{{user_name}}`. When a browser requests a page, the server reads the template, replaces every placeholder with real data, and sends the finished HTML to the client. The browser receives a complete, ready-to-display page -- no JavaScript required.

This is especially useful for:

- **Blog and CMS pages** where the layout is the same but the content changes per article
- **Admin dashboards** where the structure is fixed but the data (tables, charts) comes from a database
- **Email templates** where the greeting, body, and footer are assembled from variables
- **Error pages** where the status code and message are injected into a styled template

The ziez-template plugin gives you a template engine that integrates directly into your ziez application as middleware.

---

## Setup

Add ziez-template to your `build.zig.zon` dependencies:

```zig
.dependencies = .{
    .ziez = .{
        .url = "https://github.com/ziez-dev/ziez/archive/refs/tags/v0.0.4.tar.gz",
        .hash = "ziez-0.0.4-zH20GkljAwCKaqElKDtJ7zsUYS4bNKGd9XY4K_CCEnjZ",
    },
    .@"ziez-template" = .{
        .url = "https://github.com/ziez-dev/template/archive/refs/tags/v0.0.4.tar.gz",
        .hash = "your-template-hash-here",
    },
},
```

Then in `build.zig`, add the import:

```zig
const template_dep = b.dependency("ziez-template", .{
    .target = target,
    .optimize = optimize,
});
exe.root_module.addImport("ziez-template", template_dep.module("ziez-template"));
```

---

## TemplateConfig

`TemplateConfig` controls how the engine finds, reads, and caches your template files. Think of it as the settings panel on a printer -- it tells the engine where to find the paper (templates), how to label it (file extension), and whether to keep copies for reuse (caching).

```zig
pub const TemplateConfig = struct {
    views_dir: []const u8 = "./views",
    default_layout: ?[]const u8 = null,
    cache: bool = true,
    extension: []const u8 = ".html",
};
```

### views_dir

The directory where your template files live. The engine looks here when you call `renderAlloc()` with a template name. Defaults to `"./views"` relative to your working directory.

When the engine reads a template, it constructs the file path as `{views_dir}/{name}{extension}`. For example, with the default settings, `renderAlloc("home", ...)` looks for `./views/home.html`.

If your templates are in a different folder, point to it:

```zig
const config = ziez_template.TemplateConfig{
    .views_dir = "./templates/pages",
};
```

### default_layout

An optional layout template that wraps every rendered page. Layouts are the "letterhead" of your templates -- they provide the shared chrome (navigation bar, footer, `<head>` section) while the individual template fills in the content area.

When set, the engine automatically wraps rendered content in this layout. The layout file must be located at `{views_dir}/layouts/{layout_name}{extension}`. Set to `null` (the default) to disable layout wrapping.

See the [Layouts](#layouts) section below for a complete example.

### cache

When `true` (the default), the engine reads each template file from disk only once, then stores the content in memory using an internal `StringHashMap`. Subsequent renders reuse the cached copy. This avoids file I/O on every request and significantly improves performance in production.

When `false`, the engine reads from disk on every render and frees the file content after use. This is useful during development when you are actively editing templates and want changes to appear immediately without restarting the server.

```zig
// Development: see changes instantly
const config = ziez_template.TemplateConfig{
    .cache = false,
};

// Production: maximum performance
const config = ziez_template.TemplateConfig{
    .cache = true,
};
```

### extension

The file extension used by your template files. Defaults to `".html"`. When you call `renderAlloc("home", ...)`, the engine appends this extension and looks for `./views/home.html`.

If you prefer a different convention:

```zig
const config = ziez_template.TemplateConfig{
    .extension = ".tpl",
};
```

Now `renderAlloc("home", ...)` looks for `./views/home.tpl`.

---

## TemplateEngine

`TemplateEngine` is the core object that reads templates, caches them, and renders HTML by substituting placeholders with data.

### Creating an engine

```zig
const std = @import("std");
const ziez = @import("ziez");
const ziez_template = @import("ziez-template");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Create the template engine with custom configuration
    var engine = ziez_template.TemplateEngine.init(allocator, .{
        .views_dir = "./views",
        .cache = true,
        .extension = ".html",
    });
    defer engine.deinit();

    // Register it with your ziez application
    ziez_template.setup(&app, &engine);

    // ... register routes ...

    try app.listen("0.0.0.0:3000");
}
```

- `TemplateEngine.init` takes an allocator and a `TemplateConfig`. The allocator is used for caching template content and for rendering output.
- `engine.deinit()` iterates through the internal cache, freeing all stored keys and values, then deinitializes the hash map. Use `defer` to ensure it runs when your program exits.
- `ziez_template.setup(&app, &engine)` calls `app.use(middleware(engine))` to register the template middleware. This injects the engine pointer into every `Response` object so handlers can access it.

### renderAlloc

Renders a template file by name, substituting `{{placeholder}}` markers with values from the provided context struct.

```zig
pub fn renderAlloc(
    self: *TemplateEngine,
    allocator: std.mem.Allocator,
    name: []const u8,
    context: anytype,
) ![]const u8
```

- `name` -- the template file name without extension. The engine looks for `{views_dir}/{name}{extension}`.
- `context` -- any Zig struct whose field names match the placeholder names in your template. Uses compile-time reflection (`@typeInfo`) to iterate struct fields.
- Returns the rendered HTML as a byte slice. **The caller owns the returned memory** and is responsible for freeing it with the provided allocator.

If a `default_layout` is configured, the engine performs two renders:

1. Renders the page template with the context, producing the body content.
2. Reads the layout from `{views_dir}/layouts/{layout_name}{extension}`, renders it with the same context, then replaces the `{{body}}` placeholder with the page content.

### renderString

Renders an inline template string directly, without reading from a file. Useful for one-off templates, error messages, or dynamically constructed templates.

```zig
pub fn renderString(
    _: *TemplateEngine,
    allocator: std.mem.Allocator,
    tpl: []const u8,
    context: anytype,
) ![]const u8
```

- `tpl` -- the raw template string containing `{{placeholder}}` markers.
- `context` -- any Zig struct whose field names match the placeholders.
- **The caller owns the returned memory.**

Note: `renderString` does not apply layouts -- it renders the template string as-is.

---

## Template syntax

The template engine uses double-curly-brace placeholders: `{{variable_name}}`. Each placeholder corresponds to a field in the context struct you pass to `renderAlloc` or `renderString`. The placeholder name is trimmed of whitespace, so `{{ name }}` and `{{name}}` are equivalent.

### Value formatting

The engine automatically formats values based on their Zig type:

| Zig type | Output |
|----------|--------|
| `int`, `comptime_int` | Decimal number (e.g., `42`) |
| `float`, `comptime_float` | Decimal number (e.g., `3.14`) |
| `bool` | `"true"` or `"false"` |
| `?T` (optional) | The inner value if non-null, nothing if null |
| `[]const u8` (string slice) | The string as-is |
| `*T` (single pointer) | Dereferences and formats the inner value |
| `[N]u8` (byte array) | The string representation |
| Other slices / arrays | Uses `{any}` format |

If a placeholder has no matching field in the context struct, it is left as-is in the output (the `{{name}}` token passes through unchanged).

### Example

Given this template file at `./views/greeting.html`:

```html
<!DOCTYPE html>
<html>
<head><title>{{title}}</title></head>
<body>
    <h1>{{heading}}</h1>
    <p>Welcome, {{user_name}}! You have {{message_count}} new messages.</p>
</body>
</html>
```

And this context struct:

```zig
const context = .{
    .title = "Inbox",
    .heading = "Your Messages",
    .user_name = "Alice",
    .message_count = 3,
};
```

Note that `message_count` is an integer -- the engine formats it as `"3"` automatically. The engine produces:

```html
<!DOCTYPE html>
<html>
<head><title>Inbox</title></head>
<body>
    <h1>Your Messages</h1>
    <p>Welcome, Alice! You have 3 new messages.</p>
</body>
</html>
```

---

## Layouts

Layouts let you define shared page structure (headers, navigation, footers) in a single file, then inject page-specific content into a designated area. Think of a layout as a picture frame -- it stays the same regardless of which picture you put inside.

When `default_layout` is set in your config, the engine first renders your page template, then wraps the result in the layout template. The layout uses the **`{{body}}`** placeholder to mark where the page content should be inserted.

### Layout template: `./views/layouts/layout.html`

Note the path: layouts are stored in a `layouts/` subdirectory inside your `views_dir`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}} - My App</title>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/users">Users</a>
    </nav>
    <main>
        {{body}}
    </main>
    <footer>
        <p>&copy; 2026 My App</p>
    </footer>
</body>
</html>
```

### Page template: `./views/users.html`

```html
<h1>All Users</h1>
<table>
    <thead>
        <tr><th>Name</th><th>Email</th></tr>
    </thead>
    <tbody>
        {{user_rows}}
    </tbody>
</table>
```

### Using the layout

```zig
const config = ziez_template.TemplateConfig{
    .views_dir = "./views",
    .default_layout = "layout",
    .cache = true,
    .extension = ".html",
};
```

When you call `renderAlloc("users", context)`, the engine:

1. Reads and renders `./views/users.html` with your context, producing the page body
2. Reads the layout `./views/layouts/layout.html` and renders it with the same context
3. Replaces the `{{body}}` placeholder in the rendered layout with the page body from step 1
4. Returns the combined HTML

The layout also receives the same context struct, so placeholders like `{{title}}` in the layout's `<title>` tag work automatically.

---

## Caching behavior

When caching is enabled (the default), the engine maintains an in-memory `StringHashMap` of template file contents. Here is how it works:

1. The first time you render a template, the engine reads the file from disk (up to 4 MB per file), stores the raw content in the hash map with the template name as the key, and returns a reference to the cached copy.
2. On subsequent renders of the same template, the engine skips the file read entirely and uses the cached content.
3. The cache lives for the lifetime of the `TemplateEngine`. Calling `engine.deinit()` iterates through all entries, freeing every key and value, then deinitializes the hash map.

This means:

- In **production**, keep caching enabled. Your templates do not change between deployments, so caching eliminates redundant file I/O.
- In **development**, set `cache = false` so you can edit templates and see changes without restarting the server. When caching is off, the engine reads the file on every render and frees the content immediately after use.

---

## Complete example: rendering HTML pages with data

This example demonstrates a complete ziez application that uses the template plugin to render HTML pages. It includes a layout, multiple page templates, and dynamic data injection.

### Project structure

```
my-app/
  build.zig.zon
  build.zig
  src/
    main.zig
  views/
    layouts/
      layout.html
    home.html
    profile.html
```

### `views/layouts/layout.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{title}} - My Site</title>
</head>
<body>
    <nav>
        <a href="/">Home</a>
        <a href="/profile">Profile</a>
    </nav>
    <main>
        {{body}}
    </main>
</body>
</html>
```

### `views/home.html`

```html
<h1>{{heading}}</h1>
<p>{{description}}</p>
<ul>
    {{features_list}}
</ul>
```

### `views/profile.html`

```html
<h1>Profile: {{username}}</h1>
<div>
    <p><strong>Email:</strong> {{email}}</p>
    <p><strong>Member since:</strong> {{join_date}}</p>
    <p><strong>Posts:</strong> {{post_count}}</p>
</div>
```

### `src/main.zig`

```zig
const std = @import("std");
const ziez = @import("ziez");
const ziez_template = @import("ziez-template");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Initialize the template engine with layout support
    var engine = ziez_template.TemplateEngine.init(allocator, .{
        .views_dir = "./views",
        .default_layout = "layout",
        .cache = true,
        .extension = ".html",
    });
    defer engine.deinit();

    // Register the template middleware with the app
    ziez_template.setup(&app, &engine);

    // GET / -- Render the home page
    app.get("/", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const html = try engine.renderAlloc(allocator, "home", .{
                .title = "Welcome",
                .heading = "Welcome to My Site",
                .description = "A fast, reliable web application built with Zig.",
                .features_list = "<li>Blazing fast</li><li>Memory safe</li><li>Compile-time checked</li>",
            });
            res.html(html);
        }
    }.handler);

    // GET /profile -- Render a user profile page
    app.get("/profile", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const html = try engine.renderAlloc(allocator, "profile", .{
                .title = "Profile",
                .username = "alice",
                .email = "alice@example.com",
                .join_date = "2025-06-15",
                .post_count = 42,
            });
            res.html(html);
        }
    }.handler);

    // GET /inline -- Render a template from an inline string (no file, no layout)
    app.get("/inline", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const tpl = "<h1>Hello, {{name}}!</h1><p>Today is {{date}}.</p>";
            const html = try engine.renderString(allocator, tpl, .{
                .name = "World",
                .date = "2026-05-19",
            });
            res.html(html);
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

### Running the example

Start the server:

```bash
zig build run
```

Visit each page in your browser:

| URL | What happens |
|-----|-------------|
| `http://localhost:3000/` | Renders `home.html` wrapped in `layouts/layout.html` with feature data |
| `http://localhost:3000/profile` | Renders `profile.html` wrapped in `layouts/layout.html` with user data |
| `http://localhost:3000/inline` | Renders an inline template string without a file or layout |

Test with `curl`:

```bash
curl http://localhost:3000/
```

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Welcome - My Site</title>
</head>
<body>
    <nav>
        <a href="/">Home</a>
        <a href="/profile">Profile</a>
    </nav>
    <main>
        <h1>Welcome to My Site</h1>
<p>A fast, reliable web application built with Zig.</p>
<ul>
    <li>Blazing fast</li><li>Memory safe</li><li>Compile-time checked</li>
</ul>
    </main>
</body>
</html>
```

---

## Using the middleware directly

In addition to `setup()`, you can create a middleware from an engine and register it manually. This gives you finer control over where in the middleware chain the template engine is available.

```zig
const std = @import("std");
const ziez = @import("ziez");
const ziez_template = @import("ziez-template");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    var engine = ziez_template.TemplateEngine.init(allocator, .{
        .views_dir = "./views",
        .cache = true,
    });
    defer engine.deinit();

    // Create the middleware function
    const tmpl_middleware = ziez_template.middleware(&engine);

    // Register it at a specific position in the middleware chain
    app.use(tmpl_middleware);

    // ... routes ...

    try app.listen("0.0.0.0:3000");
}
```

The middleware injects the engine pointer into every `Response` object via `res.template_engine`. The caller owns the `TemplateEngine` lifetime -- it is not freed when `app.deinit()` is called.

---

## API reference

### TemplateConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `views_dir` | `[]const u8` | `"./views"` | Directory containing template files |
| `default_layout` | `?[]const u8` | `null` | Layout template name (resolved as `{views_dir}/layouts/{name}{extension}`), or `null` to disable |
| `cache` | `bool` | `true` | Cache template file contents in an internal `StringHashMap` |
| `extension` | `[]const u8` | `".html"` | File extension for template files |

### TemplateEngine

| Method | Signature | Description |
|--------|-----------|-------------|
| `init` | `init(allocator, config) TemplateEngine` | Create a new engine with the given allocator and configuration |
| `deinit` | `deinit(self) void` | Free all cached template keys, values, and the internal hash map |
| `renderAlloc` | `renderAlloc(self, allocator, name, context) ![]const u8` | Render a template file by name with the given context data. Caller owns the returned memory. Applies layout if `default_layout` is set. |
| `renderString` | `renderString(self, allocator, tpl, context) ![]const u8` | Render an inline template string with the given context data. Caller owns the returned memory. Does not apply layout. |

### Module-level functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `middleware` | `middleware(engine) ziez.Middleware` | Create a middleware that injects the engine into every `Response` |
| `setup` | `setup(app, engine) void` | Register template engine middleware on the app (calls `app.use(middleware(engine))`) |
