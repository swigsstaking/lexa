/**
 * bench-ocr.ts — Benchmark qwen3-vl-ocr vs deepseek-ocr
 *
 * Usage : npx tsx src/scripts/bench-ocr.ts
 *
 * Teste les 2 modèles OCR disponibles sur le DGX Spark (192.168.110.103:11434)
 * sur la fixture test-cert-salaire.pdf / test-cert-salaire-1.png.
 *
 * Stratégie image :
 *   1. Utilise le PNG pré-converti si présent (test-cert-salaire-1.png)
 *   2. Sinon, essaie pdftoppm pour convertir le PDF en PNG
 *   3. Sinon, STOP avec message clair
 *
 * Note : Ollama /api/chat avec images[] attend PNG/JPEG en base64, pas PDF.
 *
 * Session 24.5 — 2026-04-16
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://192.168.110.103:11434";
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const PDF_PATH = path.join(FIXTURES_DIR, "test-cert-salaire.pdf");
const PNG_PATH = path.join(FIXTURES_DIR, "test-cert-salaire-1.png");
const RESULTS_PATH = path.join(__dirname, "bench-ocr-results.md");
const MODELS = ["qwen3-vl-ocr", "deepseek-ocr"];
const ITERATIONS = 3;
const TIMEOUT_MS = 180_000;

// Champs attendus dans le certificat de salaire de test
// (valeurs issues de gen-test-cert-salaire.ts)
const EXPECTED_FIELDS = [
  { label: "CERTIFICAT DE SALAIRE", pattern: /certificat.{0,10}salaire/i },
  { label: "Lexa Test SA (employeur)", pattern: /lexa.{0,10}test.{0,10}sa/i },
  { label: "85000 / 85'000 (grossSalary CHF)", pattern: /85['.\s]?000|85000/i },
  { label: "72000 / 72'500 (netSalary CHF)", pattern: /72['.\s]?[05]00|72[05]00/i },
  { label: "2025 (année)", pattern: /2025/i },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface IterResult {
  iter: number;
  durationMs: number;
  rawOutputHead: string;
  rawOutputFull: string;
  outputFormat: "text_plain" | "json_wrapped" | "json_array" | "empty" | "error";
  fieldsFound: number;
  fieldsDetail: string[];
  error?: string;
}

interface ModelResult {
  model: string;
  iters: IterResult[];
  avgDurationMs: number;
  stdDurationMs: number;
  avgPrecision: number;
  dominantFormat: string;
  failCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectOutputFormat(content: string): IterResult["outputFormat"] {
  if (!content.trim()) return "empty";
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if ("text" in parsed && Array.isArray(parsed.text)) return "json_array";
      return "json_wrapped";
    } catch {
      return "json_wrapped";
    }
  }
  if (trimmed.startsWith("[")) return "json_array";
  return "text_plain";
}

function countFields(text: string): { count: number; found: string[] } {
  const found: string[] = [];
  for (const field of EXPECTED_FIELDS) {
    if (field.pattern.test(text)) {
      found.push(`✓ ${field.label}`);
    } else {
      found.push(`✗ ${field.label}`);
    }
  }
  return { count: found.filter((f) => f.startsWith("✓")).length, found };
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
  return Math.round(Math.sqrt(variance));
}

/**
 * Prépare l'image base64 pour Ollama.
 * Ollama attend PNG/JPEG base64, pas PDF.
 *
 * Stratégie :
 *   1. Utilise le PNG pré-converti (test-cert-salaire-1.png)
 *   2. Sinon, essaie pdftoppm en child_process
 *   3. Sinon, throw une erreur explicite
 */
function prepareImageBase64(): string {
  // 1. PNG pré-converti
  if (fs.existsSync(PNG_PATH)) {
    console.log(`[bench] Utilisation PNG pré-converti : ${PNG_PATH}`);
    const buf = fs.readFileSync(PNG_PATH);
    console.log(`[bench] PNG size : ${buf.byteLength} bytes`);
    return buf.toString("base64");
  }

  // 2. Conversion via pdftoppm
  const pdftoppm = (() => {
    try { return execSync("which pdftoppm", { encoding: "utf-8" }).trim(); } catch { return null; }
  })();

  if (pdftoppm && fs.existsSync(PDF_PATH)) {
    console.log(`[bench] pdftoppm trouvé à ${pdftoppm}, conversion du PDF...`);
    const outputPrefix = path.join(FIXTURES_DIR, "bench-cert");
    try {
      execSync(`pdftoppm -r 150 -png "${PDF_PATH}" "${outputPrefix}"`, { encoding: "utf-8" });
      // pdftoppm génère outputPrefix-1.png ou outputPrefix-01.png
      const candidates = [`${outputPrefix}-1.png`, `${outputPrefix}-01.png`];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          const buf = fs.readFileSync(c);
          console.log(`[bench] PNG converti : ${c} (${buf.byteLength} bytes)`);
          return buf.toString("base64");
        }
      }
    } catch (err) {
      console.error("[bench] pdftoppm conversion failed:", String(err));
    }
  }

  // 3. Impossible de préparer une image
  throw new Error(
    "Impossible de préparer une image pour le benchmark OCR.\n" +
    "Solutions :\n" +
    "  1. Générer le PNG localement : pdftoppm -r 150 -png test-cert-salaire.pdf test-cert-salaire\n" +
    "  2. Copier test-cert-salaire-1.png dans le dossier fixtures/ sur le serveur\n" +
    "  3. Installer poppler-utils : sudo apt-get install -y poppler-utils"
  );
}

// ── Benchmark d'un modèle ─────────────────────────────────────────────────────

async function benchModel(model: string, imageBase64: string): Promise<ModelResult> {
  const iters: IterResult[] = [];

  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`  [${model}] iter ${i}/${ITERATIONS}...`);
    const started = Date.now();
    let iterResult: IterResult;

    try {
      const { data } = await axios.post(
        `${OLLAMA_URL}/api/chat`,
        {
          model,
          messages: [
            {
              role: "user",
              content:
                "Extract all visible text from this document. Return only the raw text, no commentary, no JSON, no markdown.",
              images: [imageBase64],
            },
          ],
          stream: false,
          think: false,
          options: { temperature: 0.1 },
        },
        { timeout: TIMEOUT_MS },
      );

      const durationMs = Date.now() - started;
      const rawContent: string = (data.message?.content as string) ?? "";
      const outputFormat = detectOutputFormat(rawContent);
      const { count, found } = countFields(rawContent);

      iterResult = {
        iter: i,
        durationMs,
        rawOutputHead: rawContent.slice(0, 400),
        rawOutputFull: rawContent,
        outputFormat,
        fieldsFound: count,
        fieldsDetail: found,
      };

      console.log(
        `    → ${durationMs}ms | format:${outputFormat} | champs:${count}/${EXPECTED_FIELDS.length}`,
      );
    } catch (err: unknown) {
      const durationMs = Date.now() - started;
      const errorMsg = axios.isAxiosError(err)
        ? `${err.message} (status: ${err.response?.status ?? "no-response"})`
        : String(err);

      iterResult = {
        iter: i,
        durationMs,
        rawOutputHead: "",
        rawOutputFull: "",
        outputFormat: "error",
        fieldsFound: 0,
        fieldsDetail: EXPECTED_FIELDS.map((f) => `✗ ${f.label}`),
        error: errorMsg,
      };
      console.log(`    → ERROR après ${durationMs}ms : ${errorMsg.slice(0, 120)}`);
    }

    iters.push(iterResult);

    // Pause entre les iters pour éviter le throttling GPU
    if (i < ITERATIONS) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const successIters = iters.filter((r) => r.outputFormat !== "error");
  const failCount = iters.filter((r) => r.outputFormat === "error").length;
  const durations = successIters.map((r) => r.durationMs);
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const avgPrecision =
    successIters.length
      ? successIters.reduce((s, r) => s + r.fieldsFound, 0) /
        (successIters.length * EXPECTED_FIELDS.length)
      : 0;

  const formatCounts: Record<string, number> = {};
  for (const r of successIters) {
    formatCounts[r.outputFormat] = (formatCounts[r.outputFormat] ?? 0) + 1;
  }
  const dominantFormat =
    Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "error";

  return {
    model,
    iters,
    avgDurationMs,
    stdDurationMs: stdDev(durations),
    avgPrecision,
    dominantFormat,
    failCount,
  };
}

// ── Décision ──────────────────────────────────────────────────────────────────

function makeDecision(results: ModelResult[]): {
  decision: "SWITCH" | "GARDER";
  reason: string;
} {
  const qwen = results.find((r) => r.model.includes("qwen3-vl-ocr"))!;
  const deepseek = results.find((r) => r.model.includes("deepseek-ocr"))!;

  if (!qwen || !deepseek) {
    return {
      decision: "GARDER",
      reason: "Un des modèles est manquant dans les résultats.",
    };
  }

  // Critère 1 : taux d'échec deepseek (bloquant)
  if (deepseek.failCount >= 2) {
    return {
      decision: "GARDER",
      reason: `deepseek-ocr a échoué ${deepseek.failCount}/3 fois — instable, on garde qwen3-vl-ocr.`,
    };
  }

  // Critère 1b : taux d'échec qwen aussi élevé — résultats non concluants
  if (qwen.failCount >= 2 && deepseek.failCount >= 2) {
    return {
      decision: "GARDER",
      reason: `Les 2 modèles ont échoué (qwen: ${qwen.failCount}/3, deepseek: ${deepseek.failCount}/3) — résultats non concluants, on garde qwen3-vl-ocr par défaut.`,
    };
  }

  // Critère 2 : précision (deepseek >= qwen - 5%)
  if (deepseek.avgPrecision < qwen.avgPrecision - 0.05) {
    return {
      decision: "GARDER",
      reason: `deepseek-ocr précision ${(deepseek.avgPrecision * 100).toFixed(0)}% < qwen3-vl-ocr ${(qwen.avgPrecision * 100).toFixed(0)}% — qualité insuffisante.`,
    };
  }

  // Critère 3 : latence (deepseek <= qwen * 1.2)
  const latencyOk =
    qwen.avgDurationMs === 0 || deepseek.avgDurationMs <= qwen.avgDurationMs * 1.2;

  // Critère 4 : déterminisme (texte brut > json wrappé)
  const deepseekIsTextPlain = deepseek.dominantFormat === "text_plain";
  const qwenIsJson =
    qwen.dominantFormat === "json_wrapped" || qwen.dominantFormat === "json_array";

  if (deepseek.avgPrecision >= qwen.avgPrecision && latencyOk) {
    return {
      decision: "SWITCH",
      reason: [
        `deepseek-ocr précision ${(deepseek.avgPrecision * 100).toFixed(0)}% >= qwen3-vl-ocr ${(qwen.avgPrecision * 100).toFixed(0)}%`,
        qwen.avgDurationMs > 0
          ? `latence ${deepseek.avgDurationMs}ms vs ${qwen.avgDurationMs}ms (ratio ${(deepseek.avgDurationMs / qwen.avgDurationMs).toFixed(2)}x)`
          : `latence deepseek: ${deepseek.avgDurationMs}ms`,
        deepseekIsTextPlain
          ? "deepseek retourne du texte brut déterministe"
          : `deepseek format: ${deepseek.dominantFormat}`,
        qwenIsJson ? `qwen format non-déterministe: ${qwen.dominantFormat}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    };
  }

  if (deepseek.avgPrecision >= qwen.avgPrecision && !latencyOk) {
    // Précision OK, latence +20%, mais deepseek est texte brut déterministe → tolérer
    if (deepseekIsTextPlain && qwenIsJson) {
      return {
        decision: "SWITCH",
        reason: [
          `deepseek-ocr précision >= qwen (${(deepseek.avgPrecision * 100).toFixed(0)}% vs ${(qwen.avgPrecision * 100).toFixed(0)}%)`,
          `latence +${(((deepseek.avgDurationMs / (qwen.avgDurationMs || 1)) - 1) * 100).toFixed(0)}% mais deepseek est texte brut déterministe vs JSON variable de qwen`,
        ].join("; "),
      };
    }
    return {
      decision: "GARDER",
      reason: `deepseek-ocr latence ${deepseek.avgDurationMs}ms trop élevée (>1.2x de ${qwen.avgDurationMs}ms) sans gain suffisant — on garde qwen3-vl-ocr.`,
    };
  }

  return {
    decision: "GARDER",
    reason: `Résultats ambigus — deepseek précision ${(deepseek.avgPrecision * 100).toFixed(0)}% vs qwen ${(qwen.avgPrecision * 100).toFixed(0)}% sans avantage clair.`,
  };
}

// ── Rapport Markdown ──────────────────────────────────────────────────────────

function buildReport(
  results: ModelResult[],
  decision: { decision: string; reason: string },
  fixtureUsed: string,
): string {
  const lines: string[] = [];
  lines.push("# Benchmark OCR — 2026-04-16\n");
  lines.push(`Fixture : ${path.basename(fixtureUsed)} (${fs.statSync(fixtureUsed).size} bytes, 1 page, texte lisible)  `);
  lines.push(`Iterations : ${ITERATIONS} par modèle  `);
  lines.push(`Ollama : ${OLLAMA_URL}  `);
  lines.push("");

  lines.push("## Résultats\n");
  lines.push(
    "| Modèle | Latence moy. (ms) | Latence std (ms) | Précision champs | Format sortie | Taux échec |",
  );
  lines.push("|---|---|---|---|---|---|");
  for (const r of results) {
    const precision = `${(r.avgPrecision * EXPECTED_FIELDS.length).toFixed(1)} / ${EXPECTED_FIELDS.length} (${(r.avgPrecision * 100).toFixed(0)}%)`;
    lines.push(
      `| ${r.model} | ${r.avgDurationMs} | ${r.stdDurationMs} | ${precision} | ${r.dominantFormat} | ${r.failCount}/${ITERATIONS} |`,
    );
  }
  lines.push("");

  lines.push("## Détail par itération\n");
  for (const r of results) {
    lines.push(`### ${r.model}\n`);
    for (const iter of r.iters) {
      lines.push(`#### Iter ${iter.iter}`);
      lines.push(`- durée : ${iter.durationMs} ms`);
      if (iter.error) {
        lines.push(`- **ERREUR** : ${iter.error}`);
      } else {
        lines.push(`- format : ${iter.outputFormat}`);
        lines.push(`- précision : ${iter.fieldsFound}/${EXPECTED_FIELDS.length}`);
        lines.push("- champs détectés :");
        for (const f of iter.fieldsDetail) {
          lines.push(`  - ${f}`);
        }
        lines.push(`- raw output head (400 chars) :\n\`\`\`\n${iter.rawOutputHead}\n\`\`\``);
      }
      lines.push("");
    }
  }

  lines.push("## Décision\n");
  const switchVerdict = decision.decision === "SWITCH";
  lines.push(
    `**${decision.decision}${switchVerdict ? " → deepseek-ocr devient le modèle OCR principal" : " → qwen3-vl-ocr reste le modèle OCR principal"}**\n`,
  );
  lines.push(`Raison : ${decision.reason}`);
  lines.push("");

  lines.push("## Critères de décision appliqués\n");
  lines.push(
    "1. **Taux échec** (bloquant) : deepseek-ocr ≥ 2/3 échecs → GARDER",
  );
  lines.push(
    "2. **Précision champs** : deepseek doit être ≥ qwen3-vl-ocr (tolérance -5%)",
  );
  lines.push(
    "3. **Latence** : deepseek doit être ≤ qwen3-vl-ocr × 1.2 (tolérance 20%)",
  );
  lines.push(
    "4. **Déterminisme** : text_plain > json_wrapped (avantage deepseek, peut compenser latence +20%)",
  );

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Benchmark OCR Session 24.5 — 2026-04-16 ===\n");
  console.log(`Ollama URL : ${OLLAMA_URL}`);
  console.log(`Modèles : ${MODELS.join(", ")}`);
  console.log(`Itérations : ${ITERATIONS}\n`);

  // Préparer l'image base64 (PNG/JPEG, pas PDF)
  let imageBase64: string;
  let fixtureUsed: string;
  try {
    imageBase64 = prepareImageBase64();
    fixtureUsed = fs.existsSync(PNG_PATH) ? PNG_PATH : path.join(FIXTURES_DIR, "bench-cert-1.png");
    console.log(`Fixture prête (${imageBase64.length} chars base64)\n`);
  } catch (err) {
    console.error("ERREUR CRITIQUE :", String(err));
    process.exit(1);
  }

  // Vérifier la connectivité Ollama
  try {
    const { data } = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 10_000 });
    const modelNames = (data.models as Array<{ name: string }>).map((m) => m.name);
    console.log(`Ollama opérationnel — ${modelNames.length} modèles disponibles`);
    for (const m of MODELS) {
      const present = modelNames.some((n) => n.includes(m.replace(":latest", "")));
      console.log(`  ${m} : ${present ? "✓ présent" : "✗ ABSENT — le benchmark va échouer"}`);
    }
    console.log("");
  } catch (err) {
    console.error(`ERREUR : Ollama inaccessible à ${OLLAMA_URL} : ${String(err)}`);
    process.exit(1);
  }

  // Lancer les benchmarks
  const allResults: ModelResult[] = [];
  for (const model of MODELS) {
    console.log(`\n--- Benchmark ${model} ---`);
    const result = await benchModel(model, imageBase64);
    allResults.push(result);
    console.log(
      `  Résumé : avg=${result.avgDurationMs}ms std=${result.stdDurationMs}ms ` +
      `précision=${(result.avgPrecision * 100).toFixed(0)}% format=${result.dominantFormat} ` +
      `échecs=${result.failCount}/${ITERATIONS}`,
    );
  }

  // Décision
  const decision = makeDecision(allResults);
  console.log(`\n=== DÉCISION : ${decision.decision} ===`);
  console.log(`Raison : ${decision.reason}\n`);

  // Rapport
  const report = buildReport(allResults, decision, fixtureUsed);
  fs.writeFileSync(RESULTS_PATH, report, "utf-8");
  console.log(`Rapport écrit : ${RESULTS_PATH}`);
  console.log("\n--- Rapport Markdown ---\n");
  console.log(report);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
