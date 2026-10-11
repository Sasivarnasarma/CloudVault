# CloudVault Web

React + TypeScript + Tailwind frontend for CloudVault. See the [root README](../README.md) for setup.

It is a pnpm workspace package (`@cloudvault/web`), so install and run it from the repository root:

```bash
pnpm bootstrap   # install everything
pnpm dev         # dev server with the /api proxy (together with the API)
pnpm build       # type-check and production build
pnpm test        # Vitest + Testing Library (with the API tests)
pnpm check       # format and lint checks, type-check and all tests
```

To work on this package alone: `pnpm --filter @cloudvault/web dev | build | test | lint | typecheck`.
