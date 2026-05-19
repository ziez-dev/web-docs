# Serialization

Think of serialization like an Instagram filter. You have the original photo -- raw, unedited, full resolution. That is your data struct with every field: the user's ID, name, email, password hash, role, and timestamps. But what the public sees is filtered -- certain parts are hidden (password hash), effects are applied (timestamps reformatted), and the image is resized (only certain fields shown). Different audiences get different filters: a regular user sees the public profile, but an admin sees the full details.

In ziez, `SerializerConfig` is that filter. It is a comptime configuration that tells the framework exactly which fields to include, which to exclude, how to transform values, and even how to add computed fields that do not exist in the original struct. Because it is comptime, the compiler generates specialized code for each configuration -- there is zero runtime overhead for the decisions themselves.

## What SerializerConfig Does

`SerializerConfig(T)` takes a struct type `T` and returns a config type with the following fields. Every field has a sensible default, so you only set what you need.

```zig
const PublicUser = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
};
```

This creates a serialization config that takes any `User` and produces JSON without the `password_hash` field. The compiler generates a dedicated function for this exact configuration.

## Config Fields Reference

### `exclude` -- Blacklist Fields

Omit specific fields from the output. Pass a compile-time array of field names to exclude.

```zig
const Config = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash", "internal_id"},
};
```

A `User` with `{ .id = 1, .name = "Alice", .password_hash = "...", .internal_id = 999 }` serializes to:

```json
{ "id": 1, "name": "Alice" }
```

### `fields` -- Whitelist Fields

Include **only** the listed fields. Everything else is omitted. Do not use both `fields` and `exclude` on the same config -- they serve opposite purposes.

```zig
const Config = ziez.SerializerConfig(User){
    .fields = &.{ "id", "name", "avatar" },
};
```

Only `id`, `name`, and `avatar` appear in the output, regardless of how many other fields the struct has.

### `transforms` -- Transform Field Values

Apply a function to transform a field's value during serialization. Each transform is a function that takes the field's original type and returns the desired output type.

Declare transforms as a struct with `pub const` declarations matching field names:

```zig
const formatTimestamp = struct {
    fn call(ts: i64) []const u8 {
        _ = ts;
        return "2024-01-15T10:30:00Z"; // simplified
    }
}.call;

const Config = ziez.SerializerConfig(User){
    .transforms = struct {
        pub const created_at = formatTimestamp;
    },
};
```

This converts `created_at` from a raw Unix timestamp (integer) to a formatted ISO 8601 string in the output.

### `computed` -- Add Virtual Fields

Add new fields to the output that do not exist in the original struct. Each computed field is a function that takes a pointer to the original struct and returns a value.

```zig
const Config = ziez.SerializerConfig(User){
    .computed = struct {
        pub const display_name = struct {
            fn call(u: *const User) []const u8 {
                return u.name;
            }
        }.call;
    },
};
```

Even though `User` has no `display_name` field, the serialized output will include one. The function receives a read-only reference to the original data so it can derive its value from existing fields.

### `nested` -- Nested Serialization

Apply a separate `SerializerConfig` to a sub-object. This lets you control how nested structs are serialized independently.

```zig
const AddressSerializer = ziez.SerializerConfig(Address){
    .fields = &.{ "city", "country" },
};

const OrderSerializer = ziez.SerializerConfig(Order){
    .nested = struct {
        pub const address = AddressSerializer;
    },
};
```

When an `Order` is serialized, its `address` field is serialized using `AddressSerializer` -- so the `zip` field is omitted.

### `conditions` -- Conditional Field Inclusion

Include a field only when a condition function returns `true`. The function receives a pointer to the original struct.

```zig
const Config = ziez.SerializerConfig(User){
    .conditions = struct {
        pub const email = struct {
            fn call(u: *const User) bool {
                return u.is_verified;
            }
        }.call;
    },
};
```

The `email` field is only included when the user's `is_verified` field is `true`.

### `exclude_null` -- Omit Null Fields

When `true`, fields with `null` values are completely omitted from the JSON output instead of appearing as `null`.

```zig
const Config = ziez.SerializerConfig(User){
    .exclude_null = true,
};
```

A user with `.avatar = null` will not have an `avatar` key in the output at all, rather than `"avatar": null`.

### `group_fields` and `groups` -- Field Groups

Define named groups of fields and activate specific groups for a given serialization. This is useful when the same struct needs different views for different audiences.

```zig
const Config = ziez.SerializerConfig(User){
    .group_fields = struct {
        pub const @"public" = &.{ "id", "name", "avatar" };
        pub const admin = &.{ "id", "name", "email", "role" };
    },
    .groups = &.{"admin"},
};
```

With `.groups = &.{"admin"}`, only fields in the `admin` group are included in the output. Change to `.groups = &.{"public"}` and you get a different view.

Fields that are not listed in any group are always included regardless of which groups are active.

## Using Serialization in Responses

### `res.serialize(data, Config)`

Serialize a single item with a config and send it as JSON.

```zig
res.serialize(&user, PublicUser);
```

This sets the `Content-Type` to `application/json` and sends the filtered output.

### `res.serializeMany(items, Config)`

Serialize a slice or array of items with the same config.

```zig
res.serializeMany(&users, PublicUser);
```

Output is a JSON array: `[{ ... }, { ... }, ...]`

### `ziez.serialized(Config, handler)`

Wrap a handler function with automatic serialization. The handler returns a value of type `T` instead of manually calling `res.serialize()`. The framework serializes it for you.

```zig
app.get("/me", ziez.serialized(PublicUser, struct {
    fn handler(_: *ziez.Request) !User {
        return User{ .id = 1, .name = "Alice", .email = "alice@test.com", .password_hash = "...", .role = "admin", .avatar = null, .created_at = 1705312200 };
    }
}.handler));
```

The handler's return type is inferred, and the `PublicUser` config is applied automatically. If the handler returns an error, it propagates normally.

## Example: Basic Exclude (Hide Password)

```zig
const User = struct {
    id: u64,
    name: []const u8,
    email: []const u8,
    password_hash: []const u8,
};

const PublicUser = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
};

// Usage in a route:
app.get("/users/:id", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const user = User{
            .id = 1,
            .name = "Alice",
            .email = "alice@test.com",
            .password_hash = "$2b$12$...",
        };
        res.serialize(&user, PublicUser);
    }
}.handler);
```

Output:

```json
{ "id": 1, "name": "Alice", "email": "alice@test.com" }
```

## Example: Field Whitelist

```zig
const PublicProfile = ziez.SerializerConfig(User){
    .fields = &.{ "id", "name", "avatar" },
};
```

Only `id`, `name`, and `avatar` will appear in the JSON, no matter what other fields `User` has.

## Example: Transform (Timestamp Formatting)

```zig
const formatTimestamp = struct {
    fn call(ts: i64) []const u8 {
        _ = ts;
        return "2024-01-15T10:30:00Z"; // simplified -- use std.time in production
    }
}.call;

const UserWithFormattedDate = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
    .transforms = struct {
        pub const created_at = formatTimestamp;
    },
};
```

Input: `{ .created_at = 1705312200 }`

Output: `"created_at": "2024-01-15T10:30:00Z"`

## Example: Computed Field

```zig
const UserWithDisplayName = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
    .computed = struct {
        pub const display_name = struct {
            fn call(u: *const User) []const u8 {
                return u.name;
            }
        }.call;
    },
};
```

The output includes a `display_name` field that was not in the original struct:

```json
{ "id": 1, "name": "Alice", "email": "alice@test.com", "display_name": "Alice" }
```

## Example: Nested Serialization

```zig
const Address = struct {
    city: []const u8,
    zip: []const u8,
    country: []const u8,
};

const User = struct {
    id: u64,
    name: []const u8,
    address: Address,
};

const AddressPublic = ziez.SerializerConfig(Address){
    .fields = &.{ "city", "country" },
};

const UserWithAddress = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
    .nested = struct {
        pub const address = AddressPublic;
    },
};
```

The `zip` field inside `address` is omitted because `AddressPublic` uses a whitelist.

## Example: Groups (Public vs Admin)

```zig
const AdminUserView = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
    .computed = struct {
        pub const display_name = struct {
            fn call(u: *const User) []const u8 {
                return u.name;
            }
        }.call;
    },
    .group_fields = struct {
        pub const @"public" = &.{ "id", "name", "avatar", "display_name" };
        pub const admin = &.{ "id", "name", "email", "role", "created_at", "display_name" };
    },
    .groups = &.{"admin"},
};
```

When `.groups = &.{"admin"}`, the output includes the fields defined in the `admin` group.

For a public API, create a separate config:

```zig
const PublicUserView = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
    .group_fields = struct {
        pub const @"public" = &.{ "id", "name", "avatar", "display_name" };
        pub const admin = &.{ "id", "name", "email", "role", "created_at", "display_name" };
    },
    .groups = &.{"public"},
};
```

## Example: serialized() Wrapper

```zig
app.get("/me", ziez.serialized(PublicUser, struct {
    fn handler(_: *ziez.Request) !User {
        return User{
            .id = 1,
            .name = "Alice",
            .email = "alice@test.com",
            .password_hash = "...",
        };
    }
}.handler));
```

The handler returns a `User`, and the framework automatically serializes it using `PublicUser` config. No need to call `res.serialize()` manually.

## Example: Complete Example Combining Features

This example demonstrates all serialization features working together in a single application: exclusion, transforms, computed fields, nested configs, groups, and the `serialized()` wrapper.

```zig
const std = @import("std");
const ziez = @import("ziez");

// --- Domain models ---

const User = struct {
    id: u64,
    name: []const u8,
    email: []const u8,
    password_hash: []const u8,
    role: []const u8,
    avatar: ?[]const u8,
    created_at: i64,
};

const Address = struct {
    city: []const u8,
    zip: []const u8,
    country: []const u8,
};

const Order = struct {
    id: u64,
    status: []const u8,
    total: u64,
    user: User,
    address: Address,
};

// --- Transform functions ---

const formatTimestamp = struct {
    fn call(ts: i64) []const u8 {
        _ = ts;
        return "2024-01-15T10:30:00Z"; // simplified
    }
}.call;

const formatCents = struct {
    fn call(cents: u64) []const u8 {
        var buf: [32]u8 = undefined;
        const dollars = @as(f64, @floatFromInt(cents)) / 100.0;
        return std.fmt.bufPrint(&buf, "${d:.2}", .{ .d = dollars }) catch "$0.00";
    }
}.call;

// --- Serializer configs ---

// Public user view: hide password, format timestamp, omit null fields
const PublicUserSerializer = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
    .transforms = struct {
        pub const created_at = formatTimestamp;
    },
    .exclude_null = true,
};

// Admin user view: hide password, add computed field, use groups
const AdminUserSerializer = ziez.SerializerConfig(User){
    .exclude = &.{"password_hash"},
    .transforms = struct {
        pub const created_at = formatTimestamp;
    },
    .computed = struct {
        pub const display_name = struct {
            fn call(u: *const User) []const u8 {
                return u.name;
            }
        }.call;
    },
    .group_fields = struct {
        pub const @"public" = &.{ "id", "name", "avatar", "display_name" };
        pub const admin = &.{ "id", "name", "email", "role", "created_at", "display_name" };
    },
    .groups = &.{"admin"},
};

// Address with limited fields
const AddressSerializer = ziez.SerializerConfig(Address){
    .fields = &.{ "city", "country" },
};

// Order with nested serialization
const OrderSerializer = ziez.SerializerConfig(Order){
    .fields = &.{ "id", "status", "total", "user", "address" },
    .transforms = struct {
        pub const total = formatCents;
    },
    .nested = struct {
        pub const user = PublicUserSerializer;
        pub const address = AddressSerializer;
    },
};

// --- Mock data ---

var mock_users = [_]User{
    .{ .id = 1, .name = "Alice", .email = "alice@test.com", .password_hash = "hashed_secret", .role = "admin", .avatar = null, .created_at = 1705312200 },
    .{ .id = 2, .name = "Bob", .email = "bob@test.com", .password_hash = "hashed_secret2", .role = "user", .avatar = "bob.png", .created_at = 1705312200 },
    .{ .id = 3, .name = "Charlie", .email = "charlie@test.com", .password_hash = "hashed_secret3", .role = "user", .avatar = "charlie.png", .created_at = 1705312200 },
};

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Logger middleware
    app.use(struct {
        fn handler(req: *ziez.Request, _: *ziez.Response, next: *ziez.Next) void {
            std.debug.print("[ziez] {s} {s}\n", .{ @tagName(req.method), req.path });
            next.call();
        }
    }.handler);

    // GET /users -- list all users (public view, no password, null fields omitted)
    app.get("/users", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.serializeMany(&mock_users, PublicUserSerializer);
        }
    }.handler);

    // GET /users/:id -- single user with admin view (includes email, role, computed display_name)
    app.get("/users/:id", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const id_str = req.param("id") orelse return error.BadRequest;
            const id = std.fmt.parseInt(u64, id_str, 10) catch return error.BadRequest;
            for (&mock_users) |*user| {
                if (user.id == id) {
                    res.serialize(user, AdminUserSerializer);
                    return;
                }
            }
            return error.NotFound;
        }
    }.handler);

    // GET /orders/:id -- nested serialization using the serialized() wrapper
    app.get("/orders/:id", ziez.serialized(OrderSerializer, struct {
        fn handler(_: *ziez.Request) !Order {
            return Order{
                .id = 1001,
                .status = "shipped",
                .total = 4999,
                .user = mock_users[0],
                .address = .{ .city = "Jakarta", .zip = "12345", .country = "Indonesia" },
            };
        }
    }.handler));

    // GET / -- basic health check
    app.get("/", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok", .framework = "ziez" });
        }
    }.handler);

    try app.listen("0.0.0.0:3001");
}
```

Test the endpoints:

```bash
# List users (public view -- no password_hash, Alice's null avatar is omitted)
curl http://localhost:3001/users

# Get user detail (admin view -- includes email, role, display_name)
curl http://localhost:3001/users/1

# Get order with nested serialization (user and address have their own configs)
curl http://localhost:3001/orders/1
```

The `/users` response shows public data without passwords and without null fields:

```json
[
  { "id": 1, "name": "Alice", "email": "alice@test.com", "role": "admin", "created_at": "2024-01-15T10:30:00Z" },
  { "id": 2, "name": "Bob", "email": "bob@test.com", "role": "user", "avatar": "bob.png", "created_at": "2024-01-15T10:30:00Z" }
]
```

The `/users/1` response shows the admin group view:

```json
{ "id": 1, "name": "Alice", "email": "alice@test.com", "role": "admin", "created_at": "2024-01-15T10:30:00Z", "display_name": "Alice" }
```

The `/orders/1` response shows nested serialization with transforms:

```json
{
  "id": 1001,
  "status": "shipped",
  "total": "$49.99",
  "user": { "id": 1, "name": "Alice", "email": "alice@test.com", "role": "admin", "created_at": "2024-01-15T10:30:00Z" },
  "address": { "city": "Jakarta", "country": "Indonesia" }
}
```

## Important Notes

- **SerializerConfig is comptime.** All field decisions (exclude, whitelist, transforms) are resolved at compile time. The generated code has no runtime branches for "should I include this field?" -- it is either included or not in the compiled binary.
- **Do not use `exclude` and `fields` together.** They are mutually exclusive approaches. Use `exclude` when you want to include most fields and block a few. Use `fields` when you want to include only a specific set.
- **Computed fields are not part of the struct.** They only exist in the serialized output. You cannot read them from the original struct.
- **Groups can filter both data fields and computed fields.** If a computed field's name is not in any active group, it will be omitted from the output.
- **The `serialize()` and `serializeMany()` methods handle JSON formatting and content-type automatically.** You do not need to call `res.json()` or set headers.
