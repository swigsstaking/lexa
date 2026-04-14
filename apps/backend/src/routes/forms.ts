import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildDecompteTva } from "../execution/TvaFormBuilder.js";
import { renderDecompteTvaPdf } from "../execution/TvaPdfRenderer.js";
import { renderDecompteTvaXml } from "../execution/TvaXmlBuilder.js";
import { eventStore } from "../events/EventStore.js";

export const formsRouter = Router();

const tvaDecompteBodySchema = z.object({
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  year: z.number().int().min(2020).max(2100),
  method: z.enum(["effective", "tdfn"]).optional(),
});

/**
 * POST /forms/tva-decompte
 * Génère un décompte TVA AFC trimestriel à partir des events
 * TransactionClassified du trimestre demandé. Retourne le PDF (base64),
 * le XML eCH-0217 et la forme remplie, et persiste un event
 * DeclarationGenerated pour l'audit trail.
 */
formsRouter.post("/tva-decompte", async (req, res) => {
  const parse = tvaDecompteBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res
      .status(400)
      .json({ error: "invalid body", details: parse.error.issues });
  }

  const { quarter, year, method = "effective" } = parse.data;
  const tenantId = req.tenantId;

  try {
    const form = await buildDecompteTva({ tenantId, quarter, year, method });
    const [pdfBuffer, xml] = await Promise.all([
      renderDecompteTvaPdf(form),
      Promise.resolve(renderDecompteTvaXml(form)),
    ]);

    const streamId = randomUUID();
    const record = await eventStore.append({
      tenantId,
      streamId,
      event: {
        type: "DeclarationGenerated",
        payload: {
          formId: form.formId,
          version: form.version,
          method: form.method,
          period: form.period,
          totals: {
            caHt: form.projection.caHt,
            tvaDueTotal: form.projection.tvaDue.total,
            impotPrealableTotal: form.projection.impotPrealable.total,
            solde: form.projection.solde,
          },
          eventCount: form.projection.eventCount,
          generatedBy: "lexa",
          liability: "preparation_only",
        },
      },
      metadata: { source: "forms.tva-decompte" },
    });

    res.json({
      streamId: record.streamId,
      eventId: record.id,
      form: {
        formId: form.formId,
        version: form.version,
        method: form.method,
        period: form.period,
        company: form.company,
        projection: form.projection,
        generatedAt: form.generatedAt,
      },
      pdf: pdfBuffer.toString("base64"),
      xml,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[forms.tva-decompte]", err);
    res.status(500).json({ error: "tva-decompte failed", message });
  }
});
