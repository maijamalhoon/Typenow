import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/en");
const text = await readFile(path.join(root, "kids-allowlist.txt"), "utf8");
const groups = new Map();
let currentGroup = "";
for (const line of text.split(/\r?\n/)) {
  const heading = line.match(/^# (Home row|Top row|Bottom row)$/);
  if (heading) {
    currentGroup = heading[1];
    groups.set(currentGroup, []);
  } else if (line && !line.startsWith("#")) {
    if (!currentGroup) throw new Error("Kids allowlist words must follow a stage heading.");
    groups.get(currentGroup).push(line);
  }
}
const words = [...groups.values()].flat();
if (words.length < 1_900 || words.length > 2_100) {
  throw new Error(`Expected about 2,000 Kids allowlist entries; found ${words.length}.`);
}
if (new Set(words).size !== words.length || words.some((word) => !/^[a-z]{2,6}$/.test(word))) {
  throw new Error("Kids allowlist contains duplicate or invalid words.");
}

const generated = `// Generated from kids-allowlist.txt; edit the reviewed plain-text source.\nexport const kidsAllowlist = ${JSON.stringify(words)} as const;\n`;
await writeFile(path.join(root, "kids-allowlist.generated.ts"), generated);
