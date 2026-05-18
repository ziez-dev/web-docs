# Request

The `Request` struct provides access to all incoming request data.

## JSON Body

```zig
const User = struct { name: []const u8 };
const user = req.body_json(User) orelse return error.BadRequest;
```

## Form Data

```zig
const form = req.body_form();
const name = form.get("name").?;
```

## Query Parameters

```zig
const page = req.query_get("page");
```

## Multipart Uploads

```zig
var upload = try req.saveMultipart(.{
    .root_dir = "./uploads",
    .file_fields = &.{"upload"},
    .allowed_types = &.{"image/*", "application/pdf"},
});
defer upload.deinit();
```
