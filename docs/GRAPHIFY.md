# Local code map

Graphify 0.9.108 is installed in the current user's isolated uv tool environment, with its official Codex skill at `/home/cyber/.codex/skills/graphify/SKILL.md`.

The workspace's `graphify-out/graph.json`, `GRAPH_REPORT.md` and `graph.html` index maintained source, scripts and tests using local AST parsing. Dependencies, release bundles, runtime data, signing keys and secret files are excluded. This map uses zero indexing-model tokens; ordinary assistant messages and tool results still consume session tokens. No billing reduction is guaranteed.

Use `graphify query "specific symbol or relationship" --budget 800` and `graphify explain "createDatabases"` for narrow navigation. Rebuild after source removal or refactors; a stale graph can describe removed functions. Extracted links are navigation hints, not execution coverage or security proof. Review Graphify's diagnostics for dangling edges and relationships that a simpler graph collapses.

The map is a developer artifact and is not included in installed panel releases. No Graphify server or watcher is required at runtime.
