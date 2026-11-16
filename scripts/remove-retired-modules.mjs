import fs from "node:fs/promises";
import path from "node:path";
import { run } from "../src/management.mjs";
if (process.getuid?.() !== 0) throw Error("Administrator context required");
const dataDir = "/var/lib/server-panel",
  archive = path.join(dataDir, "retired-modules", String(Date.now()));
let changed = false;
const removed = [],
  preserved = [];
const docker = async (args) => run("docker", args);
const ids = (
  await docker([
    "ps",
    "-aq",
    "--filter",
    "label=com.docker.compose.project=server-panel-sso",
  ])
)
  .trim()
  .split("\n")
  .filter(Boolean);
const containers = ids.length
  ? JSON.parse(await docker(["inspect", ...ids]))
  : [];
for (const c of containers) {
  const l = c.Config?.Labels || {};
  if (
    l["com.docker.compose.project"] !== "server-panel-sso" ||
    l["com.docker.compose.project.working_dir"] !==
      path.join(dataDir, "hosted-sso") ||
    !["keycloak", "postgres"].includes(l["com.docker.compose.service"])
  )
    throw Error("SSO ownership is ambiguous; unrelated deployment preserved");
}
const vaultIds = (
  await docker(["ps", "-aq", "--filter", "name=^/server-panel-vault$"])
).trim();
let vault = null;
if (vaultIds) {
  if (!/^[a-f0-9]{12,64}$/.test(vaultIds))
    throw Error("Ambiguous Vault container");
  vault = JSON.parse(await docker(["inspect", vaultIds]))[0];
  if (
    vault.Config?.Labels?.["org.server-panel.security"] !== "vault" ||
    vault.Config.Labels["org.server-panel.directory"] !==
      path.join(dataDir, "vault")
  )
    throw Error("Vault ownership mismatch; preserved");
}
// Preflight every identity before stopping any service. Never remove data volumes.
for (const c of [...containers, ...(vault ? [vault] : [])]) {
  for (const mount of c.Mounts || [])
    if (mount.Type === "volume") preserved.push(mount.Name);
  if (c.State.Running) await docker(["stop", "--timeout", "45", c.Id]);
  await docker(["rm", c.Id]);
  removed.push(c.Name.replace(/^\//, ""));
  changed = true;
}
const networkNames = (
  await docker([
    "network",
    "ls",
    "--filter",
    "label=com.docker.compose.project=server-panel-sso",
    "--format",
    "{{.Name}}",
  ])
)
  .trim()
  .split("\n")
  .filter(Boolean);
networkNames.push("server-panel-vault");
for (const name of [...new Set(networkNames)]) {
  let n;
  try {
    n = JSON.parse(await docker(["network", "inspect", name]))[0];
  } catch {
    continue;
  }
  const owner =
    n.Labels?.["com.docker.compose.project"] === "server-panel-sso" ||
    (name === "server-panel-vault" &&
      n.Labels?.["org.server-panel.security"] === "vault");
  if (!owner || Object.keys(n.Containers || {}).length) continue;
  await docker(["network", "rm", name]);
}
await fs.mkdir(archive, { recursive: true, mode: 0o700 });
for (const name of ["hosted-sso", "vault", "sso.json"]) {
  const from = path.join(dataDir, name);
  const st = await fs.lstat(from).catch(() => null);
  if (!st) continue;
  if (st.isSymbolicLink())
    throw Error("Retired module storage must not be a symlink");
  await fs.rename(from, path.join(archive, name));
  changed = true;
}
const report = {
  changed,
  removed,
  retainedVolumes: [...new Set(preserved)],
  archive,
  localAuthenticationPreserved: true,
};
await fs.writeFile(
  path.join(archive, "retirement.json"),
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
await fs.appendFile(
  path.join(dataDir, "audit.jsonl"),
  JSON.stringify({
    time: new Date().toISOString(),
    actor: "system",
    action: "modules.sso-and-vault.retired",
  }) + "\n",
  { mode: 0o600 },
);
await fs.writeFile("/tmp/panel-retired-modules.json", JSON.stringify(report), {
  mode: 0o600,
});
await fs.chown("/tmp/panel-retired-modules.json", 1000, 1000);
console.log(
  "SSO and Vault retired. Their stored data and database volumes were preserved. Local accounts and MFA were not changed.",
);
