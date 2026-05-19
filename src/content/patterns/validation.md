# Validation

Standalone validators and validation pipes for type-safe request handling.

Think of validation like **airport baggage check**. Before your luggage boards the plane (your handler), it goes through security: weight limits checked, contents scanned, dangerous items flagged. If anything fails inspection, the bag never makes it on board -- your handler never runs.

Ziez gives you two complementary approaches:

- **Standalone validators** -- simple boolean functions you call yourself, like a handheld luggage scale.
- **Validation pipes** -- automatic pre-checks wired into your routes, like the conveyor-belt scanner that stops bad bags before they reach the gate.

---

## Standalone Validators

Every validator lives under `ziez.validator` and returns a `bool`. Use them anywhere -- in handlers, middleware, utility code, or even tests.

### Basic Checks

| Function | What it checks | Example |
|---|---|---|
| `isAscii(s)` | All characters are ASCII (0-127) | `isAscii("hello")` -> `true` |
| `isAlpha(s)` | Letters only (a-z, A-Z), non-empty | `isAlpha("Hello")` -> `true` |
| `isAlphanumeric(s)` | Letters and digits only, non-empty | `isAlphanumeric("abc123")` -> `true` |
| `isNumeric(s)` | Digits only, non-empty | `isNumeric("42")` -> `true` |
| `isLowercase(s)` | All lowercase letters, non-empty | `isLowercase("hello")` -> `true` |
| `isUppercase(s)` | All uppercase letters, non-empty | `isUppercase("HELLO")` -> `true` |
| `isEmpty(s)` | Zero-length string | `isEmpty("")` -> `true` |

```zig
const v = ziez.validator;

const a = v.isAlpha("Hello");         // true
const b = v.isNumeric("42");          // true
const c = v.isAlphanumeric("abc123"); // true
const d = v.isLowercase("hello");     // true
const e = v.isUppercase("HELLO");     // true
const f = v.isEmpty("");              // true
const g = v.isAscii("hello!");        // true
```

### Number Checks

| Function | Signature | What it checks |
|---|---|---|
| `isInt(s, opts)` | `IntOptions{.min, .max}` | Valid integer, optionally within range |
| `isFloat(s, opts)` | `FloatOptions{.min, .max}` | Valid float, optionally within range |

```zig
const v = ziez.validator;

// Basic integer check
v.isInt("42", .{});                          // true
v.isInt("-7", .{});                          // true
v.isInt("3.14", .{});                        // false

// With range
v.isInt("25", .{ .min = 18, .max = 65 });   // true
v.isInt("10", .{ .min = 18, .max = 65 });   // false

// Float check
v.isFloat("3.14", .{});                     // true
v.isFloat("-0.5", .{});                     // true
v.isFloat("2.7", .{ .min = 0.0, .max = 5.0 }); // true
```

### Network Checks

| Function | Signature | What it checks |
|---|---|---|
| `isEmail(s)` | -- | Valid email format |
| `isURL(s, opts)` | `URLOptions{.protocols}` | Valid URL, optionally restricted to given protocols |
| `isIP(s)` | -- | Valid IPv4 or IPv6 |
| `isIPv4(s)` | -- | Valid IPv4 address |
| `isIPv6(s)` | -- | Valid IPv6 address |
| `isUUID(s)` | -- | Valid UUID (8-4-4-4-12 hex format) |

```zig
const v = ziez.validator;

v.isEmail("user@example.com");                                       // true
v.isEmail("bad-email");                                              // false

v.isURL("https://example.com", .{});                                 // true
v.isURL("ftp://files.example.com", .{ .protocols = &.{"https"} });   // false

v.isIP("192.168.1.1");                                               // true
v.isIPv4("10.0.0.1");                                                // true
v.isIPv6("::1");                                                     // true
v.isUUID("550e8400-e29b-41d4-a716-446655440000");                   // true
```

### Date and Time Checks

| Function | What it checks | Example format |
|---|---|---|
| `isDate(s)` | `YYYY-MM-DD` | `"2025-01-15"` |
| `isISO8601(s)` | Full ISO 8601 datetime | `"2025-01-15T10:30:00Z"` |
| `isTime(s)` | `HH:MM` or `HH:MM:SS` | `"14:30"` or `"14:30:00"` |

```zig
const v = ziez.validator;

v.isDate("2025-01-15");                        // true
v.isDate("2025-13-01");                        // false (month > 12)

v.isISO8601("2025-01-15T10:30:00Z");           // true
v.isISO8601("2025-01-15T10:30:00+07:00");      // true
v.isISO8601("2025-01-15");                     // true (date-only is valid)

v.isTime("14:30");                             // true
v.isTime("14:30:00");                          // true
v.isTime("25:00");                             // false
```

### Encoding Checks

| Function | What it checks |
|---|---|
| `isBase64(s)` | Valid Base64 encoding |
| `isHexadecimal(s)` | Hex digits only |
| `isJSON(s)` | Looks like valid JSON (object, array, string, number, bool, null) |

```zig
const v = ziez.validator;

v.isBase64("SGVsbG8gV29ybGQ=");               // true
v.isBase64("not base64!!!");                    // false

v.isHexadecimal("deadbeef");                    // true
v.isHexadecimal("0x1A2B");                      // false ('x' is not hex)

v.isJSON("{\"key\":\"value\"}");                // true
v.isJSON("[1, 2, 3]");                          // true
v.isJSON("not json");                           // false
```

### Identity Checks

| Function | What it checks |
|---|---|
| `isCreditCard(s)` | Valid credit card number (Luhn algorithm, 13-19 digits) |
| `isSlug(s)` | URL-friendly slug (letters, digits, hyphens, no leading/trailing hyphens) |

```zig
const v = ziez.validator;

v.isCreditCard("4111 1111 1111 1111");         // true (test Visa)
v.isCreditCard("1234 5678 9012 3456");         // false (fails Luhn)

v.isSlug("my-blog-post");                      // true
v.isSlug("Hello World");                       // false (spaces)
v.isSlug("-leading-hyphen");                   // false (leading hyphen)
```

### Password Strength

`isStrongPassword(s, opts)` checks complexity requirements:

```zig
const v = ziez.validator;

const strong = v.isStrongPassword("MyP@ss1", .{
    .min_length = 8,
    .min_lowercase = 1,
    .min_uppercase = 1,
    .min_numbers = 1,
    .min_symbols = 1,
});
// false -- only 7 characters

const ok = v.isStrongPassword("MyP@ss123", .{
    .min_length = 8,
    .min_lowercase = 1,
    .min_uppercase = 1,
    .min_numbers = 1,
    .min_symbols = 1,
});
// true
```

### Locale-Aware Checks

| Function | Signature | Supported codes |
|---|---|---|
| `isPostalCode(s, country_code)` | Country-specific format | `"US"`, `"UK"`, `"CA"`, generic fallback |
| `isMobilePhone(s, country_code)` | Country-specific digit count | `"US"`/`"CA"`, `"ID"`, `"GB"`, generic fallback |

```zig
const v = ziez.validator;

v.isPostalCode("90210", "US");                 // true
v.isPostalCode("90210-1234", "US");            // true
v.isPostalCode("M1A 1A1", "CA");               // true

v.isMobilePhone("+1 555 123 4567", "US");      // true (10-11 digits)
v.isMobilePhone("0812 3456 7890", "ID");       // true (Indonesia, 10-13 digits)
```

---

## Validation Pipes

Standalone validators are great for manual checks, but pipes automate the process. A pipe sits between the incoming request and your handler. It parses and validates the input, and only calls your handler if everything passes. If validation fails, the handler never runs -- an error response is sent automatically.

### How the Flow Works

```
Request arrives
    |
    v
Pipe parses/validates the input
    |
    +-- Fails? --> 400 Bad Request / 422 Unprocessable Entity (handler never runs)
    |
    +-- Passes? --> passes clean, typed data to handler
                        |
                        v
                    Handler runs with validated data
```

### Route Parameter Pipes

#### `paramInt` -- Parse a route param as an integer

Converts the `:id` param to an integer type of your choice. Returns **400 Bad Request** if the param is missing or not a valid integer.

```zig
// Handler receives the parsed u64 as a third argument
app.get("/users/:id", ziez.paramInt("id", u64, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, id: u64) !void {
        res.json(.{ .id = id, .name = "Alice" });
    }
}.handler));
```

```bash
# Valid request
curl http://localhost:3000/users/42
# {"id":42,"name":"Alice"}

# Invalid request -- "abc" is not an integer
curl http://localhost:3000/users/abc
# {"statusCode":400,"error":"invalid integer for param: id"}
```

#### `parseUUID` -- Validate UUID format

Checks that the param matches the `8-4-4-4-12` hex UUID pattern. Returns **400 Bad Request** on failure.

```zig
app.get("/docs/:docId", ziez.parseUUID("docId", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, doc_id: []const u8) !void {
        res.json(.{ .docId = doc_id, .status = "found" });
    }
}.handler));
```

#### `parseBool` -- Parse a route param as boolean

Accepts `"true"` or `"false"` (case-sensitive). Returns **400 Bad Request** for any other value.

```zig
app.get("/flags/:active", ziez.parseBool("active", struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, active: bool) !void {
        res.json(.{ .active = active });
    }
}.handler));
```

### Query Parameter Pipes

#### `queryInt` -- Parse a query param as an integer

Extracts a query string parameter and parses it as an integer. Returns **400 Bad Request** if missing or invalid.

```zig
app.get("/items", ziez.queryInt("page", u32, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, page: u32) !void {
        res.json(.{ .page = page, .per_page = 20 });
    }
}.handler));
```

```bash
curl "http://localhost:3000/items?page=2"
# {"page":2,"per_page":20}
```

### Custom Pipe

#### `pipeParam` -- Transform a route param with your own function

Use this when none of the built-in pipes fit. Provide a transform function that takes a `[]const u8` and returns your desired type.

```zig
// Custom transform: parse as hexadecimal
fn parseHex(s: []const u8) anyerror!u32 {
    return std.fmt.parseInt(u32, s, 16);
}

app.get("/colors/:hex", ziez.pipeParam("hex", parseHex, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, rgb: u32) !void {
        res.json(.{ .rgb = rgb });
    }
}.handler));
```

### Body Validation Pipes

#### `validateBody` -- Parse JSON body

Parses the request body as JSON into the given struct type. Returns **400 Bad Request** if parsing fails.

```zig
const CreateUser = struct { name: []const u8, email: []const u8 };

app.post("/users", ziez.validateBody(CreateUser, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, user: CreateUser) !void {
        res.status(201).json(.{ .id = 1, .name = user.name, .email = user.email });
    }
}.handler));
```

#### `validateBodyWith` -- Parse JSON body with custom validation

Parses the body, then runs your custom validation function. If the function returns `false`, responds with **422 Unprocessable Entity**.

```zig
const Registration = struct { username: []const u8, age: i64 };

fn validateRegistration(r: Registration) bool {
    return r.username.len >= 3 and r.age >= 13;
}

app.post("/register", ziez.validateBodyWith(Registration, validateRegistration, struct {
    fn handler(_: *ziez.Request, res: *ziez.Response, reg: Registration) !void {
        res.status(201).json(.{ .username = reg.username });
    }
}.handler));
```

---

## Complete Example

This example combines standalone validators and validation pipes in a single server:

```zig
const std = @import("std");
const ziez = @import("ziez");

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

    // --- Param pipes ---

    // GET /users/:id -- paramInt converts :id to u64 automatically
    app.get("/users/:id", ziez.paramInt("id", u64, struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, id: u64) !void {
            res.json(.{ .id = id, .name = "Alice" });
        }
    }.handler));

    // GET /docs/:docId -- parseUUID rejects non-UUID values with 400
    app.get("/docs/:docId", ziez.parseUUID("docId", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, doc_id: []const u8) !void {
            res.json(.{ .docId = doc_id, .status = "found" });
        }
    }.handler));

    // GET /flags/:active -- parseBool converts :active to bool
    app.get("/flags/:active", ziez.parseBool("active", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, active: bool) !void {
            res.json(.{ .active = active });
        }
    }.handler));

    // --- Query pipes ---

    // GET /items?page=2 -- queryInt converts ?page= to u32
    app.get("/items", ziez.queryInt("page", u32, struct {
        fn handler(_: *ziez.Request, res: *ziez.Response, page: u32) !void {
            res.json(.{ .page = page, .per_page = 20 });
        }
    }.handler));

    // --- Standalone validators ---

    // GET /validate?email=...&uuid=...&url=...
    app.get("/validate", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const email = req.query_get("email") orelse "";
            const uuid = req.query_get("uuid") orelse "";
            const url = req.query_get("url") orelse "";
            res.json(.{
                .email = .{ .value = email, .valid = ziez.validator.isEmail(email) },
                .uuid = .{ .value = uuid, .valid = ziez.validator.isUUID(uuid) },
                .url = .{ .value = url, .valid = ziez.validator.isURL(url, .{}) },
            });
        }
    }.handler);

    try app.listen("0.0.0.0:3000");
}
```

---

## When to Use Which Approach

| Scenario | Use |
|---|---|
| Checking a value inside a handler | Standalone validators (`ziez.validator.isX`) |
| Validating route params before handler runs | `paramInt`, `parseUUID`, `parseBool`, `pipeParam` |
| Validating query params before handler runs | `queryInt` |
| Parsing JSON body into a struct | `validateBody` |
| Parsing + custom logic on the body | `validateBodyWith` |
| Declarative field-level rules on structs | Schema validation (see next section) |
