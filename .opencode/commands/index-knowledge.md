---
description: Generate hierarchical AGENTS.md knowledge base
---

# /index-knowledge

Generate hierarchical AGENTS.md files. Root + complexity-scored subdirectories.

## Usage

```
/index-knowledge                # Update mode: modify existing + create new where warranted
/index-knowledge --create-new   # Read existing → remove all → regenerate from scratch
/index-knowledge --max-depth=2  # Limit directory depth (default: 5)
```

---

## Workflow (High-Level)

1. **Discovery + Analysis** (concurrent)
   - Launch parallel explore agents (multiple Task calls in one message)
   - Main session: bash structure + LSP codemap + read existing AGENTS.md
2. **Score & Decide** - Determine AGENTS.md locations from merged findings
3. **Generate** - Root first, then subdirs in parallel
4. **Review** - Deduplicate, trim, validate

<user-request>
$ARGUMENTS
</user-request>