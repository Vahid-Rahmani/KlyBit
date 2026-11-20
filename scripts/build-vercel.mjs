import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The only public origin. Google sign-in is bound to it (GOOGLE_REDIRECT_URI),
// so every legacy alias is permanently redirected here before any route runs.
const CANONICAL_ORIGIN = "https://klybit.vercel.app";
const LEGACY_HOSTS = ["az-802-eosin.vercel.app"];

process.env.NITRO_PRESET = "vercel";
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const result = spawnSync(process.execPath, [vite, "build"], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const configPath = fileURLToPath(new URL("../.vercel/output/config.json", import.meta.url));
if (!existsSync(configPath)) {
  console.error(`Missing ${configPath}; cannot add legacy-domain redirects.`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
const redirects = LEGACY_HOSTS.map((host) => ({
  src: "^/(.*)$",
  has: [{ type: "host", value: host }],
  status: 308,
  headers: { Location: `${CANONICAL_ORIGIN}/$1` },
}));
config.routes = [...redirects, ...(config.routes ?? []).filter((route) => !LEGACY_HOSTS.includes(route?.has?.[0]?.value))];
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Added permanent redirects to ${CANONICAL_ORIGIN} for: ${LEGACY_HOSTS.join(", ")}`);
