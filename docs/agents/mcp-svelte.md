# Svelte MCP Server

Use the Svelte MCP server for Svelte 5 and SvelteKit documentation when btca doesn't have the answer.

## Tools

### 1. list-sections

Discover available documentation sections. **Use first** to find relevant sections.

### 2. get-documentation

Fetch full documentation for specific sections. After `list-sections`, analyze the `use_cases` field and fetch ALL relevant sections.

### 3. svelte-autofixer

Analyze Svelte code for issues/suggestions. **Must use** before finalizing any Svelte code. Keep calling until no issues remain.

### 4. playground-link

Generate a Svelte Playground link. Only call after user confirms they want one. **Never** use if code was written to project files.
