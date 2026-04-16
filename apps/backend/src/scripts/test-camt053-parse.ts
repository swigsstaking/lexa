import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseCamt053 } from '../services/Camt053Parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const xml = readFileSync(join(__dirname, 'fixtures/sample-camt053.xml'), 'utf-8');
const result = parseCamt053(xml);
console.log('messageId:', result.messageId);
console.log('accountIban:', result.accountIban);
console.log('accountName:', result.accountName);
console.log('transactions count:', result.transactions.length);
console.log('warnings:', result.warnings);
console.log('---');
result.transactions.forEach((tx, i) => {
  console.log(`TX${i+1}: ${tx.creditDebit} ${tx.amount} CHF — ${tx.counterpartyName ?? 'n/a'} — ${tx.reference ?? tx.txId}`);
});
