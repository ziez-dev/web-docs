# bun-react-tailwind-shadcn-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

Or choose a custom port:

```bash
PORT=3100 bun dev
```

To run for production:

```bash
bun start
```

Static assets:

- Put logos, images, and favicons in `public/`.
- Access them from the app with root-relative paths like `/logo.svg` or `/images/ziez-logo.png`.
- `bun dev` serves files from `public/` directly, and `bun run build` copies them into `dist/`.
- Favicons are wired from `public/favicon_16.ico`, `public/favicon_32.ico`, `public/favicon_48.png`, `public/favicon_180.png`, and `public/favicon_192.png`.

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
