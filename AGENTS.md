# Layers of memory

Voice-to-image app that generates decade-styled images from spoken memories using local Whisper and Seedream 4.5.

## Essentials

- **Package manager:** pnpm
- **Commands:** `pnpm check` | `pnpm format` | `pnpm lint`
- **Stack:** SvelteKit, Svelte 5, TypeScript, Tailwind v4, Vercel AI SDK
- **Error handling:** neverthrow
- **No explicit return types** unless necessary
- **No unit tests** unless explicitly requested

## Documentation Tools

1. **btca** (priority) — Query local repo clones for up-to-date framework docs. See [btca reference](docs/agents/btca.md)
2. **Svelte MCP server** (fallback) — For Svelte-specific queries. See [MCP Svelte reference](docs/agents/mcp-svelte.md)

## Detailed Guidelines

| Topic       | File                                                           |
| ----------- | -------------------------------------------------------------- |
| Svelte 5    | [.cursor/rules/svelte.mdc](.cursor/rules/svelte.mdc)           |
| Tailwind v4 | [.cursor/rules/tailwindcss.mdc](.cursor/rules/tailwindcss.mdc) |
| neverthrow  | [.cursor/rules/neverthrow.mdc](.cursor/rules/neverthrow.mdc)   |
| Convex      | [.cursor/rules/convex.mdc](.cursor/rules/convex.mdc)           |
