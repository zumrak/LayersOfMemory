# btca — Better Context Agent

Query local clones of library/framework repos for up-to-date, source-first information. **Use instead of web searches** for framework questions.

## When to Use

- "How does X work in Svelte 5?" or similar
- Current API behavior that may differ from training data
- User says "use btca" or references a configured resource

## Quick Reference

```bash
# Ask a question (primary command)
btca ask -r <resource> -q "<question>"

# Multiple resources
btca ask -r svelte -r effect -q "<question>"

# @mentions in question
btca ask -q "@svelte @tailwind How do I style components?"

# List configured resources
btca config resources list

# Add git resource
btca config resources add -n <name> -t git -u <url> -b <branch>

# Add local resource
btca config resources add -n <name> -t local --path <absolutePath>

# Remove resource
btca config resources remove -n <name>

# Change model
btca config model -p opencode -m claude-haiku-4-5

# Clear cache
btca clear
```

## Behavior Rules

- **Prefer `btca ask`** over TUI (agents can't operate TUIs)
- **Ask for missing info** before running commands
- Run `btca config resources list` first if unsure what's available

## Config Locations

| Location                           | Purpose                           |
| ---------------------------------- | --------------------------------- |
| `~/.config/btca/btca.config.jsonc` | Global config                     |
| `./btca.config.jsonc`              | Project config (overrides global) |

## Troubleshooting

| Problem                   | Solution                            |
| ------------------------- | ----------------------------------- |
| "No resources configured" | Run `btca config resources add ...` |
| "Provider not connected"  | Run `opencode auth`                 |
| Stale/corrupted cache     | Run `btca clear`                    |

---

For full CLI reference including `config resources add` flags and model options, see [.cursor/rules/better_context.mdc](../../.cursor/rules/better_context.mdc).
