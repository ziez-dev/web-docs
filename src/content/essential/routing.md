# Routing

ziez provides a declarative routing API with support for named parameters, wildcards, and HTTP method handlers.

## Basic Routes

```zig
app.get("/", handler);
app.post("/users", createUser);
app.put("/users/:id", updateUser);
app.delete("/users/:id", deleteUser);
```

## Named Parameters

```zig
app.get("/users/:id", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        const id = req.param("id").?;
        res.json(.{ .id = id });
    }
}.handler);
```

## Wildcard Routes

```zig
app.all("/*", struct {
    fn handler(_: *ziez.Request, _: *ziez.Response) !void {
        return error.NotFound;
    }
}.handler);
```
