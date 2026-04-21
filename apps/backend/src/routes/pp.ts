import { Router } from "express";
import { z } from "zod";
import { queryAsTenant } from "../db/postgres.js";

export const ppRouter = Router();

type Tone = "pos" | "neg" | "tax" | "asset";

interface PpItem {
  code: string;
  name: string;
  amount: number;
  count: number;
  tone: Tone;
}

interface PpBucket {
  k: string;
  items: PpItem[];
}

const yearQuerySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2020)
    .max(2100)
    .default(new Date().getFullYear()),
});

// GET /pp/summary?year=2026
ppRouter.get("/summary", async (req, res) => {
  const parse = yearQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: "invalid query", details: parse.error.flatten() });
  }

  const { year } = parse.data;
  const tenantId = req.tenantId;

  try {
    const [incomeRes, expenseRes, savingsRes, draftRes] = await Promise.all([
      queryAsTenant<{ category_code: string; label: string; amount: string; count: number }>(
        tenantId,
        `SELECT category_code, label, amount::text, count
         FROM pp_income_entries
         WHERE tenant_id = $1 AND fiscal_year = $2
         ORDER BY category_code`,
        [tenantId, year],
      ),
      queryAsTenant<{ category_code: string; label: string; amount: string; count: number }>(
        tenantId,
        `SELECT category_code, label, amount::text, count
         FROM pp_expense_entries
         WHERE tenant_id = $1 AND fiscal_year = $2
         ORDER BY category_code`,
        [tenantId, year],
      ),
      queryAsTenant<{ category_code: string; label: string; amount: string; count: number }>(
        tenantId,
        `SELECT category_code, label, amount::text, count
         FROM pp_savings_entries
         WHERE tenant_id = $1 AND fiscal_year = $2
         ORDER BY category_code`,
        [tenantId, year],
      ),
      queryAsTenant<{ state: { step4?: { pilier3a?: number; rachatsLpp?: number } } }>(
        tenantId,
        `SELECT state FROM taxpayer_drafts WHERE tenant_id = $1 AND fiscal_year = $2 LIMIT 1`,
        [tenantId, year],
      ),
    ]);

    const buckets: PpBucket[] = [];

    if (incomeRes.rows.length > 0) {
      buckets.push({
        k: "Salaire & revenus",
        items: incomeRes.rows.map((r) => ({
          code: r.category_code,
          name: r.label,
          amount: parseFloat(r.amount),
          count: r.count,
          tone: "pos" as Tone,
        })),
      });
    }

    if (expenseRes.rows.length > 0) {
      buckets.push({
        k: "Vie privée",
        items: expenseRes.rows.map((r) => ({
          code: r.category_code,
          name: r.label,
          amount: parseFloat(r.amount),
          count: r.count,
          tone: "neg" as Tone,
        })),
      });
    }

    if (savingsRes.rows.length > 0) {
      buckets.push({
        k: "Épargne & prévoyance",
        items: savingsRes.rows.map((r) => ({
          code: r.category_code,
          name: r.label,
          amount: parseFloat(r.amount),
          count: r.count,
          tone: "asset" as Tone,
        })),
      });
    }

    // Bucket "Obligations fiscales" calculé depuis taxpayer_drafts si disponible
    const draft = draftRes.rows[0];
    if (draft) {
      const s4 = draft.state?.step4 ?? {};
      const taxItems: PpItem[] = [];

      // Estimation simplifiée d'après les déductions connues.
      // Les montants exacts proviennent du wizard (submit-vs/ge/vd/fr).
      // On expose des placeholders calculés pour affichage workspace uniquement.
      const pilier3a = s4.pilier3a ?? 0;
      const rachatsLpp = s4.rachatsLpp ?? 0;

      if (pilier3a > 0 || rachatsLpp > 0) {
        const totalDeductions = pilier3a + rachatsLpp;
        taxItems.push({
          code: "O01",
          name: "Estimation impôts (après déductions)",
          amount: Math.round(totalDeductions * 0.3),
          count: 1,
          tone: "tax",
        });
      }

      if (taxItems.length > 0) {
        buckets.push({ k: "Obligations fiscales", items: taxItems });
      }
    }

    return res.json({ buckets, fiscalYear: year });
  } catch (err) {
    console.error("[pp.summary]", err);
    return res.status(500).json({ error: "pp summary failed" });
  }
});
