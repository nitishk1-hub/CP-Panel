import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const panelBuildAssets=['security-center.js','tasks.js','databases.js','index.html','app.js','docker-workspace.js','system-tools.js','style.css','host-overview.js','websites.js','network-system.js','tools-bundle.js','security-map.js','security-map-worker.js','security-map.css','xterm.css','security-world.svg','security-land.geojson'];
export async function panelBuild(root){const files=await Promise.all(panelBuildAssets.map(name=>fs.readFile(path.join(root,'public',name))));return crypto.createHash('sha256').update(files.map(b=>b.toString()).join('')).digest('hex').slice(0,12);}
