import { database, query } from "@/lib/database";
import { focusAvailability, recordOutcome } from "./service";
import { focusProvider } from "./focus";
import { collectFiles } from "./resources";
import { dispatch } from "@/modules/integrations/queue";
// Scheduler only recovers explicitly enqueued work; it never creates drafts or approves production.
export async function processFiscalQueue() {
  if (
    process.env.FOCUS_NFE_HOMOLOGATION_ENABLED !== "true" &&
    process.env.FOCUS_NFE_PRODUCTION_ENABLED !== "true"
  )
    return {
      processed: 0,
      disabled: 0,
      filesRecovered: 0,
      requiresAttention: 0,
    };
  const jobs = (
    await query(`SELECT o.id,o.restaurant_id,o.environment,o.payload,d.id AS document_id,o.payload->>'fiscal_action' AS action
 FROM integration_operations o JOIN fiscal_documents d ON d.restaurant_id=o.restaurant_id AND d.environment=o.environment AND (d.operation_id=o.id OR o.operation_key='fiscal_cancel:'||d.id::text)
 WHERE o.provider='focus' AND o.kind='fiscal' AND o.attempts<20
 AND o.status IN ('prepared','dispatching','unknown','pending') AND (o.lease_until IS NULL OR o.lease_until<now())
 ORDER BY o.updated_at LIMIT 100`)
  ).rows;
  let processed = 0,
    disabled = 0;
  for (const job of jobs) {
    if (processed >= 3) break;
    const config = focusAvailability(job.restaurant_id, job.environment);
    if (
      !config.enabled ||
      (config.cnpj && config.cnpj !== job.payload.cnpj_emitente)
    ) {
      disabled++;
      continue;
    }
    const c = await database.connect();
    try {
      const result = await dispatch(
        c,
        job.restaurant_id,
        job.id,
        focusProvider({
          restaurantId: job.restaurant_id,
          issuerCnpj: String(job.payload.cnpj_emitente),
          ...config,
          taxProfileValidated: true,
        }),
      );
      await recordOutcome(
        c,
        job.restaurant_id,
        job.document_id,
        result,
        { role: "system", name: "worker" },
        job.action === "cancel",
      );
      processed++;
    } finally {
      c.release();
    }
  }
  let filesRecovered = 0;
  const documents = (
    await query(`SELECT d.id,d.restaurant_id,d.environment FROM fiscal_documents d JOIN integration_operations o ON o.id=d.operation_id AND o.restaurant_id=d.restaurant_id
   WHERE o.status IN ('succeeded','cancelled') AND (
    NOT EXISTS(SELECT 1 FROM fiscal_files f WHERE f.document_id=d.id AND f.kind='xml') OR
    NOT EXISTS(SELECT 1 FROM fiscal_files f WHERE f.document_id=d.id AND f.kind='auxiliary') OR
    (EXISTS(SELECT 1 FROM integration_operations co WHERE co.restaurant_id=d.restaurant_id AND co.environment=d.environment AND co.operation_key='fiscal_cancel:'||d.id::text AND co.status='succeeded') AND NOT EXISTS(SELECT 1 FROM fiscal_files f WHERE f.document_id=d.id AND f.kind='cancellation')))
   AND NOT EXISTS(SELECT 1 FROM fiscal_events e WHERE e.document_id=d.id AND e.action IN ('files_collected','files_failed') AND e.created_at>now()-interval '5 minutes')
   AND (SELECT count(*) FROM fiscal_events e WHERE e.document_id=d.id AND e.action IN ('files_collected','files_failed'))<20
   ORDER BY d.updated_at LIMIT 100`)
  ).rows;
  for (const doc of documents) {
    if (!focusAvailability(doc.restaurant_id, doc.environment).enabled)
      continue;
    try {
      await collectFiles(doc.restaurant_id, doc.id);
      filesRecovered++;
    } catch {
      await query(
        "INSERT INTO fiscal_events(restaurant_id,document_id,actor,action,detail) VALUES($1,$2,'worker','files_failed','{}')",
        [doc.restaurant_id, doc.id],
      );
    }
    break; // At most one bounded file recovery per run, in addition to three consultations.
  }
  const attention = (
    await query(
      "SELECT count(*)::int n FROM integration_operations WHERE kind='fiscal' AND provider='focus' AND status IN ('unknown','pending','dispatching') AND attempts>=20",
    )
  ).rows[0].n;
  return { processed, disabled, filesRecovered, requiresAttention: attention };
}
