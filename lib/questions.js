import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QDIR = path.join(__dirname, "..", "public", "questions");

function smartParse(filePath) {
  let c = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  c = c.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  c = c.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(c);
}

// usedQMap: { [rel]: string[] } — pass in pair's history to get real remaining counts
export function getCategories(usedQMap = {}) {
  const out = {};
  if (!fs.existsSync(QDIR)) return out;
  for (const folder of fs.readdirSync(QDIR).sort()) {
    const fp = path.join(QDIR, folder);
    if (!fs.statSync(fp).isDirectory()) continue;
    out[folder] = [];
    for (const file of fs.readdirSync(fp).filter(f => f.endsWith(".json")).sort()) {
      try {
        const d   = smartParse(path.join(fp, file));
        const qs  = d.questions || [];
        const rel = `${folder}/${file}`;
        const usedTexts = new Set(usedQMap[rel] || []);

        // Fresh questions remaining per tier
        const fresh = (pts) => qs.filter(q => q.points === pts && !usedTexts.has(q.q)).length;
        const possible_games = Math.min(
          Math.floor(fresh(200) / 2),
          Math.floor(fresh(400) / 2),
          Math.floor(fresh(600) / 2)
        );
        // Total games this category supports (for display)
        const total_games = Math.min(
          Math.floor(qs.filter(q=>q.points===200).length / 2),
          Math.floor(qs.filter(q=>q.points===400).length / 2),
          Math.floor(qs.filter(q=>q.points===600).length / 2)
        );
        out[folder].push({
          name: d.category || file.replace(".json", ""),
          file: rel,
          possible_games,
          total_games,
        });
      } catch(e) { console.error(file, e.message); }
    }
  }
  return out;
}

// usedQMap: { [rel]: string[] } — texts of questions already played
export function pickQuestions(rel, usedQMap = {}) {
  const d  = smartParse(path.join(QDIR, rel));
  const qs = d.questions || [];
  const usedTexts = new Set(usedQMap[rel] || []);

  const pick = (pts) => {
    // Prefer fresh questions not yet used
    let pool = qs.filter(q => q.points === pts && !usedTexts.has(q.q));
    // Fallback: if exhausted, allow repeats
    if (pool.length < 2) pool = qs.filter(q => q.points === pts);
    if (pool.length < 2) return null;
    return pool.sort(() => Math.random() - .5).slice(0, 2);
  };

  const p200 = pick(200), p400 = pick(400), p600 = pick(600);
  if (!p200 || !p400 || !p600) return null;

  const picked = [...p200, ...p400, ...p600];
  return {
    category: d.category || "",
    questions: picked,
    newUsed: picked.map(q => q.q),   // caller merges into usedQMap[rel]
  };
}
