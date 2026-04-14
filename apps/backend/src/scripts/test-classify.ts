import { classifierAgent } from "../agents/classifier/ClassifierAgent.js";

// Test minimal: une seule transaction pour valider le pipeline end-to-end
// (le Spark GB10 est en forte contention GPU avec les autres projets user)
const sampleTransactions = [
  {
    date: "2026-04-13",
    description: "LOYER BUREAU RUE DU RHONE 45",
    amount: -2800.0,
    currency: "CHF",
  },
];

async function main(): Promise<void> {
  console.log("Testing ClassifierAgent (end-to-end pipeline validation)...\n");

  for (const tx of sampleTransactions) {
    console.log(`\n=== ${tx.description} (${tx.amount} ${tx.currency}) ===`);
    try {
      const result = await classifierAgent.classify(tx);
      console.log(`  Debit:    ${result.debitAccount}`);
      console.log(`  Credit:   ${result.creditAccount}`);
      console.log(`  TTC/HT:   ${result.amountTtc} / ${result.amountHt}`);
      console.log(`  TVA:      ${result.tvaRate}% (${result.tvaCode})`);
      console.log(`  Conf:     ${(result.confidence * 100).toFixed(0)}%`);
      console.log(`  Duration: ${result.durationMs} ms`);
      console.log(`  Reason:   ${result.reasoning}`);
      if (result.citations.length > 0) {
        console.log(`  Cites:    ${result.citations.map((c) => `${c.law} ${c.article}`).join(", ")}`);
      }
      console.log("\n  RAW RESPONSE:");
      console.log(result.rawOllamaResponse.slice(0, 2000));
      console.log("\n  END RAW");
    } catch (err) {
      console.error(`  ERROR: ${(err as Error).message}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
