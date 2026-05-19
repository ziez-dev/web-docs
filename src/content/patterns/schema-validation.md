# Schema Validation

Declarative validation rules on struct fields -- the framework checks them for you.

Think of schema validation like a **form with built-in rules**. Instead of writing validation code by hand, you simply declare the rules next to each field: "Name must be at least 2 characters", "Email must be valid", "Age must be between 18 and 120". The framework inspects those rules and rejects invalid data before your handler ever sees it.

---

## Rule Types

### StringRule

Validates `[]const u8` fields with length, format, regex, and custom checks.

```zig
ziez.schema.StringRule{
    .min_length = 2,        // minimum character count
    .max_length = 64,       // maximum character count
    .pattern = null,        // regex pattern (not yet enforced)
    .format = .email,       // one of the Format enum values
    .trim = false,          // trim whitespace before validating
    .custom = null,         // custom validation function: *const fn ([]const u8) bool
}
```

#### Available Formats

The `format` field accepts a `ziez.schema.Format` enum value. Each one maps to a standalone validator under the hood:

| Format | What it enforces |
|---|---|
| `.email` | Valid email address |
| `.url` | Valid URL |
| `.uuid` | Valid UUID (8-4-4-4-12) |
| `.ipv4` | Valid IPv4 address |
| `.ipv6` | Valid IPv6 address |
| `.ip` | Valid IPv4 or IPv6 |
| `.alpha` | Letters only |
| `.alphanumeric` | Letters and digits only |
| `.numeric` | Digits only |
| `.date` | `YYYY-MM-DD` format |
| `.iso8601` | Full ISO 8601 datetime |
| `.base64` | Valid Base64 encoding |
| `.hexadecimal` | Hex digits only |
| `.slug` | URL-friendly slug |
| `.credit_card` | Valid credit card (Luhn check) |
| `.lowercase` | All lowercase |
| `.uppercase` | All uppercase |
| `.json` | Valid JSON |

### IntRule

Validates integer fields with range boundaries.

```zig
ziez.schema.IntRule{
    .min = 0,       // minimum value (inclusive)
    .max = 120,     // maximum value (inclusive)
}
```

### FloatRule

Validates float fields with range boundaries.

```zig
ziez.schema.FloatRule{
    .min = 0.0,     // minimum value (inclusive)
    .max = 100.0,   // maximum value (inclusive)
}
```

---

## Declaring Rules on a Struct

Attach a `pub const rules` declaration to any struct. The `rules` is a anonymous struct where each field name matches a struct field, and each value is a `StringRule`, `IntRule`, or `FloatRule`.

```zig
const CreateUser = struct {
    name: []const u8,
    email: []const u8,
    age: i64,

    pub const rules = .{
        .name = ziez.schema.StringRule{ .min_length = 2, .max_length = 64 },
        .email = ziez.schema.StringRule{ .format = .email },
        .age = ziez.schema.IntRule{ .min = 18, .max = 120 },
    };
};
```

Fields without a corresponding rule entry are simply not validated. You only declare rules for the fields you want to check.

---

## Using Schema Validation Pipes

### `validateBodySchema` -- Validate JSON body against struct rules

Parses the JSON body into type `T`, then runs `T.rules` validation. If any rule fails, responds with **422 Unprocessable Entity** and the handler never runs.

```zig
app.post("/users", ziez.validateBodySchema(CreateUser, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, user: CreateUser) !void {
        res.status(201).json(.{
            .id = 42,
            .name = user.name,
            .email = user.email,
            .age = user.age,
        });
    }
}.handler));
```

```bash
# Valid request
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","age":25}'
# {"id":42,"name":"Alice","email":"alice@example.com","age":25}

# Invalid request -- name too short, bad email, age out of range
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"A","email":"not-an-email","age":15}'
# {"statusCode":422,"error":"Validation failed"}
```

### `validateBodyWithSchema` -- Inline rules without modifying the struct

Sometimes you want to validate a struct with different rules depending on the endpoint, or you cannot modify the struct itself. `validateBodyWithSchema` lets you pass rules inline as the second argument.

```zig
const Product = struct { title: []const u8, price: i64 };

app.post("/products", ziez.validateBodyWithSchema(Product, .{
    .title = ziez.schema.StringRule{ .min_length = 1, .max_length = 200 },
    .price = ziez.schema.IntRule{ .min = 0 },
}, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, p: Product) !void {
        res.status(201).json(.{ .id = 99, .title = p.title, .price = p.price });
    }
}.handler));
```

### `validateQuerySchema` -- Validate query parameters

Builds the struct from query parameters, then validates against `T.rules`. Works with `[]const u8`, integer, float, and optional fields.

```zig
const SearchQuery = struct {
    q: []const u8,
    page: i64,

    pub const rules = .{
        .q = ziez.schema.StringRule{ .min_length = 1, .max_length = 100 },
        .page = ziez.schema.IntRule{ .min = 1 },
    };
};

app.get("/search", ziez.validateQuerySchema(SearchQuery, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, q: SearchQuery) !void {
        res.json(.{ .query = q.q, .page = q.page, .results = .{} });
    }
}.handler));
```

```bash
# Valid request
curl "http://localhost:3000/search?q=hello&page=2"
# {"query":"hello","page":2,"results":{}}

# Invalid -- empty query, page 0
curl "http://localhost:3000/search=q=&page=0"
# {"statusCode":422,"error":"Validation failed"}
```

---

## ValidationResult

Under the hood, all schema validation produces a `ValidationResult`:

```zig
pub const ValidationResult = struct {
    valid: bool,
    errors: []ValidationError,
};

pub const ValidationError = struct {
    field: []const u8,
    message: []const u8,
};
```

When validation fails in a pipe, the framework responds with:

- **Status**: `422 Unprocessable Entity`
- **Body**: The error is passed to your global error handler via `res.error_message`

---

## Custom Validation Function

For rules that cannot be expressed with format or length, use the `custom` field on `StringRule`:

```zig
fn isValidUsername(s: []const u8) bool {
    // Usernames must start with a letter and contain only letters/numbers/underscores
    if (s.len == 0) return false;
    if (!ziez.validator.isAlpha(s[0..1])) return false;
    for (s) |c| {
        if (!std.ascii.isAlphanumeric(c) and c != '_') return false;
    }
    return true;
}

const RegisterUser = struct {
    username: []const u8,

    pub const rules = .{
        .username = ziez.schema.StringRule{
            .min_length = 3,
            .max_length = 30,
            .custom = isValidUsername,
        },
    };
};
```

The `custom` function runs after `min_length`, `max_length`, and `format` checks all pass.

---

## Nested Struct Validation

Schema validation works recursively. If a struct field is itself a struct with `pub const rules`, those nested rules are checked automatically.

```zig
const Address = struct {
    street: []const u8,
    city: []const u8,
    zip: []const u8,

    pub const rules = .{
        .street = ziez.schema.StringRule{ .min_length = 5, .max_length = 200 },
        .city = ziez.schema.StringRule{ .min_length = 2, .max_length = 100 },
        .zip = ziez.schema.StringRule{ .format = .alphanumeric },
    };
};

const Order = struct {
    item: []const u8,
    shipping_address: Address,

    pub const rules = .{
        .item = ziez.schema.StringRule{ .min_length = 1 },
        // No rule needed for shipping_address -- nested rules are found automatically
    };
};
```

When `validateBodySchema(Order, ...)` runs, it will validate `item` with the Order rules, then descend into `shipping_address` and validate its fields using Address rules.

---

## Manual Validation

You can also call the schema validator directly (not through a pipe) using `ziez.schema.validate`:

```zig
const result = ziez.schema.validate(allocator, my_struct_instance);
if (!result.valid) {
    for (result.errors) |err| {
        std.debug.print("Field {s}: {s}\n", .{ err.field, err.message });
    }
}
```

Or with explicit rules separate from the struct:

```zig
const result = ziez.schema.validateWithRules(allocator, my_product, .{
    .title = ziez.schema.StringRule{ .min_length = 1 },
    .price = ziez.schema.IntRule{ .min = 0 },
});
```

---

## Complete Example

This example shows struct rules, inline rules, query validation, and the error handler all working together:

```zig
const std = @import("std");
const ziez = @import("ziez");

// Struct with declared rules
const CreateUser = struct {
    name: []const u8,
    email: []const u8,
    age: i64,

    pub const rules = .{
        .name = ziez.schema.StringRule{ .min_length = 2, .max_length = 64 },
        .email = ziez.schema.StringRule{ .format = .email },
        .age = ziez.schema.IntRule{ .min = 18, .max = 120 },
    };
};

// Query struct with rules
const SearchQuery = struct {
    q: []const u8,
    page: i64,

    pub const rules = .{
        .q = ziez.schema.StringRule{ .min_length = 1, .max_length = 100 },
        .page = ziez.schema.IntRule{ .min = 1 },
    };
};

pub fn main() !void {
    const allocator = std.heap.smp_allocator;
    var app = ziez.init(allocator);
    defer app.deinit();

    app.on_error(struct {
        fn handler(req: *ziez.Request, res: *ziez.Response, err: anyerror) void {
            const info = ziez.errorToResponse(err);
            const msg = res.error_message orelse info.message;
            std.debug.print("[ERROR] {s} {d}: {s}\n", .{ req.path, info.code, msg });
            res.status(info.code).json(.{ .statusCode = info.code, .@"error" = msg });
        }
    }.handler);

    // POST /users -- validate body against CreateUser.rules
    app.post("/users", ziez.validateBodySchema(CreateUser, struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, user: CreateUser) !void {
            res.status(201).json(.{
                .id = 42,
                .name = user.name,
                .email = user.email,
                .age = user.age,
            });
        }
    }.handler));

    // GET /search -- validate query params against SearchQuery.rules
    app.get("/search", ziez.validateQuerySchema(SearchQuery, struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, q: SearchQuery) !void {
            res.json(.{ .query = q.q, .page = q.page, .results = .{} });
        }
    }.handler));

    // POST /products -- inline rules (no struct-level rules needed)
    const Product = struct { title: []const u8, price: i64 };
    app.post("/products", ziez.validateBodyWithSchema(Product, .{
        .title = ziez.schema.StringRule{ .min_length = 1, .max_length = 200 },
        .price = ziez.schema.IntRule{ .min = 0 },
    }, struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, p: Product) !void {
            res.status(201).json(.{ .id = 99, .title = p.title, .price = p.price });
        }
    }.handler));

    try app.listen("0.0.0.0:3000");
}
```

---

## Validation Pipes Quick Reference

| Pipe | Body source | Rule source | Error status |
|---|---|---|---|
| `validateBodySchema(T, handler)` | JSON body | `T.rules` on struct | 422 |
| `validateBodyWithSchema(T, rules, handler)` | JSON body | Inline rules argument | 422 |
| `validateQuerySchema(T, handler)` | Query params | `T.rules` on struct | 422 |
