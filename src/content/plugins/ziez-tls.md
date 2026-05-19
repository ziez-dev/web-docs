# TLS Plugin

HTTPS encryption with automatic HTTP-to-HTTPS redirect, cipher suite control, mutual TLS, SNI support, and hot certificate reloading.

---

## What is TLS and why do you need it?

Imagine you are sending a confidential letter through the postal system. If you write it on a postcard, anyone who handles it along the way -- mail sorters, delivery drivers, nosy neighbors -- can read every word. But if you seal it inside an envelope and encode the contents, only the intended recipient with the decoding key can read it.

TLS (Transport Layer Security) is that sealed envelope for network traffic. When a browser connects to your server over plain HTTP, every request and response travels as readable text across the internet. Anyone between the user and your server -- ISPs, coffee shop Wi-Fi operators, malicious actors -- can see passwords, session tokens, personal data, and everything else.

When you enable TLS, the browser and server perform a handshake, exchange cryptographic keys, and encrypt all subsequent communication. The result is HTTPS -- the same HTTP protocol, but wrapped in an encrypted tunnel. This is why every modern browser shows a padlock icon for HTTPS sites and warns users about plain HTTP.

You need TLS whenever your application handles:

- **User authentication** -- passwords and session tokens must never travel in plain text
- **Personal data** -- names, emails, addresses, financial information
- **API keys and secrets** -- any credential that grants access to your system
- **Form submissions** -- any data a user types into your site

In practice, you should enable TLS for all traffic, not just "sensitive" endpoints. Modern browsers and search engines treat plain HTTP as insecure.

---

## Setup

Add ziez-tls to your `build.zig.zon` dependencies:

```zig
.dependencies = .{
    .ziez = .{
        .url = "https://github.com/ziez-dev/ziez/archive/refs/tags/v0.0.4.tar.gz",
        .hash = "ziez-0.0.4-zH20GkljAwCKaqElKDtJ7zsUYS4bNKGd9XY4K_CCEnjZ",
    },
    .@"ziez-tls" = .{
        .url = "https://github.com/ziez-dev/tls/archive/refs/tags/v0.0.4.tar.gz",
        .hash = "your-tls-hash-here",
    },
},
```

Then in `build.zig`, add the import:

```zig
const tls_dep = b.dependency("ziez-tls", .{
    .target = target,
    .optimize = optimize,
});
exe.root_module.addImport("ziez-tls", tls_dep.module("ziez-tls"));
```

---

## Configuration overview

The TLS plugin is configured through `TlsSetupConfig`, which wraps two sub-configs. `TlsConfig` controls the HTTPS listener itself (certificates, protocol version, cipher suites, client authentication). `RedirectHttpConfig` optionally starts a second listener on port 80 that redirects all plain HTTP traffic to your HTTPS port.

```zig
const ziez_tls = @import("ziez-tls");

const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .file_path = "./certs/server.pem" },
        .key = .{ .file_path = "./certs/server-key.pem" },
        .min_version = .tls_1_2,
    },
    .redirect = .{
        .enabled = true,
        .port = 80,
        .to = 443,
    },
};
```

---

## Certificate and key sources

TLS requires a certificate (a public document that identifies your server) and a private key (a secret that proves you own the certificate). The plugin supports three ways to provide them, using tagged unions called `CertSource` and `KeySource`.

### CertSource and KeySource

| Variant | Type | Description |
|---------|------|-------------|
| `file_path` | `[]const u8` | Path to a file on disk. Read once at startup. |
| `pem_bytes` | `[]const u8` | PEM-encoded data as a byte slice in memory |
| `der_bytes` | `[]const u8` | DER-encoded (binary) data as a byte slice in memory |

### From files on disk

The most common approach. Point to your certificate and key files:

```zig
const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .file_path = "./certs/server.pem" },
        .key = .{ .file_path = "./certs/server-key.pem" },
    },
};
```

This works well when your certificates are managed by tools like Let's Encrypt, certbot, or your infrastructure provider.

### From in-memory bytes

Useful when certificates are embedded in the binary, loaded from a secrets manager, or fetched from an environment variable at startup:

```zig
const cert_pem: []const u8 = "-----BEGIN CERTIFICATE-----\n...";
const key_pem: []const u8 = "-----BEGIN PRIVATE KEY-----\n...";

const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .pem_bytes = cert_pem },
        .key = .{ .pem_bytes = key_pem },
    },
};
```

You can also use DER format (binary encoding) with `.der_bytes`:

```zig
const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .der_bytes = cert_der_bytes },
        .key = .{ .der_bytes = key_der_bytes },
    },
};
```

### Certificate validation

When the `TlsContext` is initialized, the plugin performs several checks:

- **Certificate parsing**: The leaf certificate is parsed from DER and validated.
- **Chain verification**: If the certificate source contains intermediate certificates (PEM with multiple blocks), each certificate in the chain is parsed and the chain is verified link by link.
- **Validity period**: The certificate's `not_before` and `not_after` timestamps are checked against the current time. Expired or not-yet-valid certificates produce `error.CertificateExpired` or `error.CertificateNotYetValid`.
- **Key-cert match**: The public key algorithm in the certificate is compared against the type of the private key. A mismatch produces `error.KeyCertMismatch`.

Supported private key types: **ECDSA P-256**, **ECDSA P-384**, **Ed25519**, and **RSA**.

### Hot reload

The plugin uses a `TlsRuntime` with atomic reference counting for certificate reloading. When you call `runtime.reload(new_config)`, a new `TlsContext` is created and swapped in atomically. Existing connections continue using the old context until they finish, after which the old context is freed. This enables zero-downtime certificate rotation.

---

## TLS version

The `min_version` field controls the minimum TLS protocol version the server will accept. Clients using older versions are rejected during the handshake.

```zig
pub const TlsVersion = enum { tls_1_2, tls_1_3 };
```

| Value | Description |
|-------|-------------|
| `tls_1_2` | Accept TLS 1.2 and TLS 1.3 connections. Broad compatibility with older clients. This is the default. |
| `tls_1_3` | Accept only TLS 1.3 connections. Most secure and fastest handshake, but some older clients (very old browsers, embedded devices) may not support it. |

TLS 1.3 is the modern standard. It is faster (fewer round trips during handshake) and more secure (removed outdated cryptographic algorithms). Unless you need to support very old clients, prefer `tls_1_3`.

```zig
const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .file_path = "./certs/server.pem" },
        .key = .{ .file_path = "./certs/server-key.pem" },
        .min_version = .tls_1_3, // only TLS 1.3
    },
};
```

---

## Cipher suites

Cipher suites define the specific encryption algorithms used for the TLS connection. The `cipher_suites` field lets you control which algorithms the server offers, in preference order.

```zig
pub const CipherSuite = enum(u16) {
    AES_128_GCM_SHA256 = 0x1301,
    AES_256_GCM_SHA384 = 0x1302,
    CHACHA20_POLY1305_SHA256 = 0x1303,
};
```

| Suite | Description |
|-------|-------------|
| `AES_128_GCM_SHA256` | Fast, hardware-accelerated on most modern CPUs. Good balance of speed and security. |
| `AES_256_GCM_SHA384` | Stronger key size, slightly slower on CPUs without AES-NI instructions. |
| `CHACHA20_POLY1305_SHA256` | Excellent performance on mobile and embedded devices without AES hardware acceleration. |

The default includes all three suites, which gives the server maximum flexibility to negotiate the best option with each client:

```zig
.cipher_suites = &.{ .AES_128_GCM_SHA256, .CHACHA20_POLY1305_SHA256, .AES_256_GCM_SHA384 },
```

To restrict to a specific suite:

```zig
const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .file_path = "./certs/server.pem" },
        .key = .{ .file_path = "./certs/server-key.pem" },
        .cipher_suites = &.{.CHACHA20_POLY1305_SHA256},
    },
};
```

---

## Client authentication (mTLS)

By default, TLS only authenticates the server to the client (the client verifies the server's certificate). Mutual TLS (mTLS) flips this around and also authenticates the client to the server -- both sides present certificates. Think of it like entering a secure building where both the guard checks your ID and you check the guard's badge.

```zig
pub const ClientAuth = enum { none, request, require };
```

| Value | Behavior |
|-------|----------|
| `none` | Do not ask the client for a certificate. This is the default and appropriate for public websites. |
| `request` | Ask the client for a certificate, but allow the connection even if none is provided. Useful for optional authentication where you want to identify clients that have certs without rejecting those that do not. |
| `require` | Reject the connection if the client does not present a valid certificate. Used for internal APIs, service-to-service communication, and zero-trust networks. |

When using `request` or `require`, you must also specify `client_ca` to tell the server which Certificate Authority to trust for client certificates:

```zig
const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .file_path = "./certs/server.pem" },
        .key = .{ .file_path = "./certs/server-key.pem" },
        .client_auth = .require,
        .client_ca = .{ .file_path = "./certs/ca.pem" },
    },
};
```

The `client_ca` field accepts the same `CertSource` variants as `cert`: `file_path`, `pem_bytes`, or `der_bytes`. The CA bundle is loaded during `TlsContext` initialization and used to verify client certificates during the TLS handshake.

---

## HTTP-to-HTTPS redirect

When you enable the redirect, the plugin starts a second HTTP listener that sends a `301 Moved Permanently` response for every request, redirecting the client to the same URL but over HTTPS. Think of it as a sign at the entrance of a building that says "This entrance is closed. Please use the secure entrance around the corner."

```zig
pub const RedirectHttpConfig = struct {
    enabled: bool = true,
    port: u16 = 80,
    to: ?u16 = null,
    exclude: []const []const u8 = &.{},
};
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Whether to start the redirect listener |
| `port` | `80` | The port for the plain HTTP listener |
| `to` | `null` | The HTTPS port to redirect to. `null` means use the same port as the main HTTPS server. |
| `exclude` | `&.{}` | URL paths that should not be redirected (served as plain HTTP) |

### Basic redirect

```zig
const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .file_path = "./certs/server.pem" },
        .key = .{ .file_path = "./certs/server-key.pem" },
    },
    .redirect = .{
        .enabled = true,
        .port = 80,    // listen for HTTP on port 80
        .to = 443,     // redirect to HTTPS on port 443
    },
};
```

Any request to `http://yourdomain.com/anything` receives a 301 redirect to `https://yourdomain.com/anything`.

### Excluding health check paths

Some load balancers and monitoring tools probe your server over plain HTTP. You can exclude specific paths from redirection so they continue to work over HTTP:

```zig
.redirect = .{
    .enabled = true,
    .port = 80,
    .to = 443,
    .exclude = &.{ "/health", "/metrics" },
},
```

Requests to `http://yourdomain.com/health` will be served normally over HTTP, while all other paths redirect to HTTPS. Path matching is exact -- `/health` matches `/health` but not `/healthcheck`.

---

## SNI hostname support

Server Name Indication (SNI) allows a single server to host multiple TLS certificates for different domains. When a client connects, it sends the hostname it is trying to reach as part of the TLS handshake. The server uses this hint to select the correct certificate.

Set `sni_hostnames` to the list of hostnames your server should respond to:

```zig
const config = ziez_tls.TlsSetupConfig{
    .tls = .{
        .cert = .{ .file_path = "./certs/wildcard.pem" },
        .key = .{ .file_path = "./certs/wildcard-key.pem" },
        .sni_hostnames = &.{ "example.com", "api.example.com", "www.example.com" },
    },
};
```

If `sni_hostnames` is `null` (the default), the server uses the provided certificate for all incoming connections regardless of the requested hostname.

---

## Accessing TLS information in handlers

Once TLS is active, your route handlers can inspect the TLS state of each incoming request through the `Request` object. This is useful for logging, access control, and auditing.

| Method / Field | Returns | Description |
|---------------|---------|-------------|
| `req.isSecure()` | `bool` | `true` if the connection is over TLS |
| `req.scheme()` | `[]const u8` | `"https"` or `"http"` |
| `req.tls` | `bool` | Whether TLS is active on this connection |
| `req.tls_version` | `?TlsVersion` | The negotiated TLS version, or `null` if not using TLS |
| `req.client_cert_subject` | `?[]const u8` | The subject DN of the client certificate (mTLS only) |
| `req.client_cert_fingerprint` | `?[]const u8` | The SHA-256 fingerprint of the client certificate (mTLS only) |

### Example: checking TLS in a handler

```zig
app.get("/tls-info", struct {
    fn handler(req: *ziez.Request, res: *ziez.Response) !void {
        res.json(.{
            .secure = req.isSecure(),
            .scheme = req.scheme(),
            .tls_version = if (req.tls_version) |v| @tagName(v) else "none",
            .client_cert_subject = req.client_cert_subject orelse "no client cert",
        });
    }
}.handler);
```

A request over HTTPS returns:

```json
{
    "secure": true,
    "scheme": "https",
    "tls_version": "tls_1_3",
    "client_cert_subject": "no client cert"
}
```

---

## Complete example: HTTPS server with auto-redirect

This example starts an HTTPS server on port 443 and automatically redirects all HTTP traffic from port 80 to HTTPS.

### Generating self-signed certificates for development

Before running the example, generate a self-signed certificate and key:

```bash
openssl req -x509 -newkey rsa:2048 -keyout server-key.pem \
  -out server.pem -days 365 -nodes \
  -subj "/CN=localhost"
```

Place `server.pem` and `server-key.pem` in a `certs/` directory in your project.

### `src/main.zig`

```zig
const std = @import("std");
const ziez = @import("ziez");
const ziez_tls = @import("ziez-tls");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Configure TLS with automatic HTTP-to-HTTPS redirect
    try ziez_tls.setup(&app, .{
        .tls = .{
            .cert = .{ .file_path = "./certs/server.pem" },
            .key = .{ .file_path = "./certs/server-key.pem" },
            .min_version = .tls_1_2,
            .cipher_suites = &.{ .AES_128_GCM_SHA256, .CHACHA20_POLY1305_SHA256, .AES_256_GCM_SHA384 },
        },
        .redirect = .{
            .enabled = true,
            .port = 80,
            .to = 443,
            .exclude = &.{ "/health" },
        },
    });

    app.get("/", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{
                .message = "hello over HTTPS!",
                .secure = req.isSecure(),
                .scheme = req.scheme(),
            });
        }
    }.handler);

    app.get("/health", struct {
        fn handler(_: *ziez.Request, res: *ziez.Response) !void {
            res.json(.{ .status = "ok" });
        }
    }.handler);

    // Listen on port 443 (HTTPS). The redirect listener runs on port 80.
    try app.listen("0.0.0.0:443");
}
```

### Testing

Start the server:

```bash
zig build run
```

Test HTTPS directly (use `-k` to accept self-signed certificates):

```bash
curl -k https://localhost/
```

```json
{"message":"hello over HTTPS!","secure":true,"scheme":"https"}
```

Test the redirect from HTTP to HTTPS:

```bash
curl -v http://localhost/
```

```
< HTTP/1.1 301 Moved Permanently
< Location: https://localhost/
```

Test the excluded health check path (stays on HTTP, no redirect):

```bash
curl http://localhost:80/health
```

```json
{"status":"ok"}
```

---

## Complete example: mutual TLS (mTLS)

This example requires clients to present a valid certificate before they can access any endpoint. This is useful for internal APIs, microservice communication, and zero-trust architectures.

### Generating certificates for mTLS

First, create a Certificate Authority (CA), then generate server and client certificates signed by that CA:

```bash
# 1. Create a CA key and self-signed CA certificate
openssl genrsa -out ca-key.pem 2048
openssl req -x509 -new -key ca-key.pem -out ca.pem -days 365 \
  -subj "/CN=My CA"

# 2. Create a server key and CSR, then sign with the CA
openssl genrsa -out server-key.pem 2048
openssl req -new -key server-key.pem -out server.csr \
  -subj "/CN=localhost"
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem \
  -CAcreateserial -out server.pem -days 365

# 3. Create a client key and CSR, then sign with the CA
openssl genrsa -out client-key.pem 2048
openssl req -new -key client-key.pem -out client.csr \
  -subj "/CN=service-client"
openssl x509 -req -in client.csr -CA ca.pem -CAkey ca-key.pem \
  -CAcreateserial -out client.pem -days 365
```

Place `ca.pem`, `server.pem`, `server-key.pem`, `client.pem`, and `client-key.pem` in a `certs/` directory.

### `src/main.zig`

```zig
const std = @import("std");
const ziez = @import("ziez");
const ziez_tls = @import("ziez-tls");

pub fn main() !void {
    const allocator = std.heap.smp_allocator;

    var app = ziez.init(allocator);
    defer app.deinit();

    // Configure mTLS: require client certificates signed by our CA
    try ziez_tls.setup(&app, .{
        .tls = .{
            .cert = .{ .file_path = "./certs/server.pem" },
            .key = .{ .file_path = "./certs/server-key.pem" },
            .min_version = .tls_1_3,
            .client_auth = .require,
            .client_ca = .{ .file_path = "./certs/ca.pem" },
        },
    });

    app.get("/", struct {
        fn handler(req: *ziez.Request, res: *ziez.Response) !void {
            const subject = req.client_cert_subject orelse "unknown";
            const fingerprint = req.client_cert_fingerprint orelse "unknown";
            res.json(.{
                .message = "authenticated via mTLS",
                .client_subject = subject,
                .client_fingerprint = fingerprint,
            });
        }
    }.handler);

    try app.listen("0.0.0.0:443");
}
```

### Testing mTLS

Connect with a valid client certificate:

```bash
curl -k --cert client.pem --key client-key.pem https://localhost/
```

```json
{"message":"authenticated via mTLS","client_subject":"service-client","client_fingerprint":"a1b2c3..."}
```

Connect without a client certificate (rejected):

```bash
curl -k https://localhost/
```

```
curl: (35) error:0A000412:SSL routines::tlsv1 alert bad certificate
```

The server rejects the TLS handshake before it even reaches your handler, because the client did not present a valid certificate signed by the configured CA.

Connect with a self-signed (untrusted) client certificate (also rejected):

```bash
openssl genrsa -out fake-key.pem 2048
openssl req -x509 -new -key fake-key.pem -out fake.pem -days 365 -subj "/CN=attacker"
curl -k --cert fake.pem --key fake-key.pem https://localhost/
```

The handshake fails because `fake.pem` is not signed by the CA the server trusts.

---

## Error reference

The `TlsContext.init()` function can return these errors during setup:

| Error | Cause |
|-------|-------|
| `CertificateFileNotFound` | The certificate file path does not exist |
| `CertificateParseError` | The certificate could not be parsed (invalid PEM/DER, corrupt data, chain verification failed) |
| `CertificateExpired` | The certificate's `not_after` time is in the past |
| `CertificateNotYetValid` | The certificate's `not_before` time is in the future |
| `KeyFileNotFound` | The private key file path does not exist |
| `KeyParseError` | The private key could not be parsed (unsupported format, corrupt data) |
| `KeyCertMismatch` | The private key type does not match the certificate's public key algorithm |
| `InvalidPemFormat` | The PEM data could not be decoded |
| `UnsupportedKeyType` | The private key uses an algorithm the plugin does not support |
| `UnsupportedCurve` | The elliptic curve is not supported |
| `OutOfMemory` | Memory allocation failed |

---

## API reference

### TlsSetupConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tls` | `TlsConfig` | (required) | TLS listener configuration |
| `redirect` | `?RedirectHttpConfig` | `null` | Optional HTTP-to-HTTPS redirect |

### TlsConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cert` | `CertSource` | (required) | Server certificate chain (leaf + intermediates) |
| `key` | `KeySource` | (required) | Server private key |
| `min_version` | `TlsVersion` | `.tls_1_2` | Minimum accepted TLS version |
| `cipher_suites` | `[]const CipherSuite` | all three suites | Allowed cipher suites in preference order |
| `client_auth` | `ClientAuth` | `.none` | Client certificate requirement |
| `client_ca` | `?CertSource` | `null` | CA certificate for verifying client certificates (mTLS) |
| `sni_hostnames` | `?[]const []const u8` | `null` | Hostnames for SNI validation |

### RedirectHttpConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `true` | Whether to start the redirect listener |
| `port` | `u16` | `80` | HTTP listener port |
| `to` | `?u16` | `null` | HTTPS port to redirect to (`null` = use main server port) |
| `exclude` | `[]const []const u8` | `&.{}` | Paths excluded from redirect (exact match) |

### CertSource / KeySource

| Variant | Type | Description |
|---------|------|-------------|
| `file_path` | `[]const u8` | Path to a PEM or DER file on disk |
| `pem_bytes` | `[]const u8` | PEM-encoded bytes in memory |
| `der_bytes` | `[]const u8` | DER-encoded bytes in memory |

### Enums

| Enum | Values | Description |
|------|--------|-------------|
| `TlsVersion` | `tls_1_2`, `tls_1_3` | TLS protocol version |
| `ClientAuth` | `none`, `request`, `require` | Client certificate behavior |
| `CipherSuite` | `AES_128_GCM_SHA256`, `AES_256_GCM_SHA384`, `CHACHA20_POLY1305_SHA256` | TLS 1.3 encryption algorithms |

### Module-level function

| Function | Signature | Description |
|----------|-----------|-------------|
| `setup` | `setup(app, config) !void` | Configure and start TLS on the application. Registers the TLS runtime via `app.registerTls()` and optionally starts an HTTP redirect listener via `app.registerRedirectHttp()`. |
