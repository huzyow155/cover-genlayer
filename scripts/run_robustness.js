const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const fs = require('fs');
const path = require('path');
const { createClient, chains, createAccount } = require('genlayer-js');
const { generatePrivateKey } = require('viem/accounts');

function cleanText(rawStr) {
  let text = rawStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\xa0/g, ' ');
  const isHtml = text.toLowerCase().includes('<html') || text.toLowerCase().includes('<body') || text.toLowerCase().includes('<div') || text.toLowerCase().includes('<p>');
  if (isHtml) {
    text = text.replace(/<script.*?>.*?<\/script>/gis, ' ');
    text = text.replace(/<style.*?>.*?<\/style>/gis, ' ');
    text = text.replace(/<!--.*?-->/gs, ' ');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/?(?:p|div|h[1-6]|li|tr|th|td|blockquote|section|article|header|footer)\b[^>]*>/gi, '\n');
    text = text.replace(/<[^>]+>/g, ' ');
  } else {
    text = text.replace(/```.*?```/gs, ' ');
    text = text.replace(/`[^`]+`/g, ' ');
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    text = text.replace(/^[ \t]*[#]+[ \t]*/gm, '');
    text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '');
    text = text.replace(/^[ \t]*\d+\.[ \t]+/gm, '');
    text = text.replace(/[*_~]/g, '');
  }
  text = text.replace(/\u201c/g, '"').replace(/\u201d/g, '"').replace(/\u2018/g, "'").replace(/\u2019/g, "'").replace(/\u2013/g, '-').replace(/\u2014/g, '-');
  return text.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

function normText(s) {
  if (!s) return "";
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function quoteInPage(quote, pageText) {
  const qNorm = normText(quote);
  if (qNorm.length < 8) return false;
  const pNorm = normText(pageText);
  return (" " + pNorm + " ").includes(" " + qNorm + " ");
}

function numberInQuote(quote, n) {
  if (n < 0) return false;
  const qNorm = normText(quote);
  const tokens = qNorm.split(/\s+/);
  return tokens.includes(String(n));
}

function decide(status, minutes, minFull, minHalf, quoteOk, tripwire) {
  if (tripwire) return "REVIEW";
  if (status === "UNCLEAR" || !quoteOk) return "REVIEW";
  if (status === "OPERATIONAL") return "NO_PAY";
  if ((status === "OUTAGE" || status === "DEGRADED") && minutes < 1) return "REVIEW";
  if (status === "OUTAGE" && minutes >= minFull) return "PAY_100";
  if (status === "OUTAGE" && minutes >= minHalf) return "PAY_50";
  if (status === "DEGRADED" && minutes >= minFull) return "PAY_25";
  return "NO_PAY";
}

function parseExtraction(text) {
  if (!text) return { valid: false, status: "UNCLEAR", minutes: 0, quote: "" };
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  let obj;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    return { valid: false, status: "UNCLEAR", minutes: 0, quote: "" };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { valid: false, status: "UNCLEAR", minutes: 0, quote: "" };
  }
  const keys = Object.keys(obj);
  if (keys.length !== 3 || !keys.includes("status") || !keys.includes("minutes") || !keys.includes("quote")) {
    return { valid: false, status: "UNCLEAR", minutes: 0, quote: "" };
  }
  const st = obj.status;
  const m = obj.minutes;
  const q = obj.quote;
  if (!["OPERATIONAL", "DEGRADED", "OUTAGE", "UNCLEAR"].includes(st)) {
    return { valid: false, status: "UNCLEAR", minutes: 0, quote: "" };
  }
  if (typeof m !== "number" || !Number.isInteger(m) || m < 0 || m > 100000) {
    return { valid: false, status: "UNCLEAR", minutes: 0, quote: "" };
  }
  if (typeof q !== "string" || q.length > 300) {
    return { valid: false, status: "UNCLEAR", minutes: 0, quote: "" };
  }
  return { valid: true, status: st, minutes: m, quote: q };
}

// Custom receipt poll using direct JSON-RPC to reduce request overhead
async function pollReceiptViaRpc(txHash, maxAttempts = 40, intervalMs = 3500) {
  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await fetch("https://studio.genlayer.com/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionByHash",
          params: [txHash],
          id: i,
        }),
      });
      const data = await res.json();
      const txObj = data?.result;
      if (txObj && (txObj.status_name === "ACCEPTED" || txObj.status_name === "FINALIZED" || txObj.status_name === "UNDETERMINED")) {
        return txObj;
      }
    } catch (e) {
      // Ignore transient network hiccups
    }
  }
  throw new Error(`Receipt timeout for ${txHash}`);
}

async function main() {
  const pagesDir = path.join(__dirname, '../fixtures/pages');
  const targetFixtures = [
    { file: "status-s1-outage-75.md", expected: "PAY_100" },
    { file: "status-s2-outage-35.md", expected: "PAY_50" },
    { file: "status-s3-outage-20.md", expected: "NO_PAY" },
    { file: "status-s4-degraded-90.md", expected: "PAY_25" },
    { file: "status-s5-operational-reformatted.html", expected: "NO_PAY" },
    { file: "status-s7-no-duration.md", expected: "REVIEW" },
  ];

  const probeAddress = "0xFF6dF478E40b66AAC3Af5271C66b94B750E6E58f";
  console.log("Using ProbeExtract contract deployed on Studionet at:", probeAddress);

  // Resume or load existing results if present
  const outPath = path.join(__dirname, '../docs/evidence/robustness_runs.json');
  let existingData = { summary: {}, runs: [] };
  if (fs.existsSync(outPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    } catch (e) {}
  }

  for (const item of targetFixtures) {
    const rawContent = fs.readFileSync(path.join(pagesDir, item.file), 'utf8');
    const cleaned = cleanText(rawContent);

    // Filter existing runs for this fixture
    const existingForPage = existingData.runs.filter(r => r.fixture === item.file);
    const startRun = existingForPage.length + 1;

    if (startRun > 10) {
      console.log(`Fixture ${item.file} already has 10 runs recorded. Skipping.`);
      continue;
    }

    console.log(`\n=================================================`);
    console.log(`Testing Fixture: ${item.file} (Runs ${startRun}..10)`);
    console.log(`=================================================`);

    for (let i = startRun; i <= 10; i++) {
      const key = `${item.file}_run_${i}`;
      console.log(`[${item.file}] Run ${i}/10 executing...`);

      // Use a fresh throwaway account per run
      const account = createAccount(generatePrivateKey());
      const client = createClient({ chain: chains.studionet, account });

      let txHash = null;
      let txObj = null;
      let lat = "0";

      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          const tw0 = Date.now();
          txHash = await client.writeContract({
            address: probeAddress,
            functionName: "extract_page",
            args: [key, cleaned],
          });
          console.log(`  Tx submitted: ${txHash}. Waiting for receipt...`);
          txObj = await pollReceiptViaRpc(txHash);
          lat = ((Date.now() - tw0) / 1000).toFixed(2);
          break;
        } catch (err) {
          const msg = err.message || "";
          let backoffSec = 5;
          if (err.cause?.data?.retry_after_seconds) {
            backoffSec = err.cause.data.retry_after_seconds + 3;
          } else if (msg.includes("Rate limit")) {
            backoffSec = 30;
          }
          console.warn(`    Attempt ${attempt}/10 failed (${msg.slice(0, 80)}). Backing off ${backoffSec}s...`);
          if (attempt === 10) throw err;
          await new Promise(r => setTimeout(r, backoffSec * 1000));
        }
      }

      console.log(`  Receipt in ${lat}s: status=${txObj.status_name}, result=${txObj.result_name}`);

      // Read back raw extraction
      let rawExtract = "";
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          rawExtract = await client.readContract({
            address: probeAddress,
            functionName: "get_result",
            args: [key],
          });
          break;
        } catch (e) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      console.log(`  Raw extraction: ${rawExtract}`);

      const parsed = parseExtraction(rawExtract);
      const isParsed = parsed.valid;
      let qOk = isParsed && quoteInPage(parsed.quote, cleaned);
      if (parsed.minutes > 0 && !numberInQuote(parsed.quote, parsed.minutes)) {
        qOk = false;
      }
      const outcome = isParsed
        ? decide(parsed.status, parsed.minutes, 60, 30, qOk, false)
        : "REVIEW";

      const runRecord = {
        fixture: item.file,
        run_index: i,
        tx_hash: txHash,
        latency_seconds: lat,
        raw_output: rawExtract,
        parsed_valid: isParsed,
        extracted_status: parsed.status,
        extracted_minutes: parsed.minutes,
        extracted_quote: parsed.quote,
        quote_ok: qOk,
        computed_outcome: outcome,
        expected_outcome: item.expected,
        matched: (outcome === item.expected),
      };
      existingData.runs.push(runRecord);

      // Save incrementally
      fs.writeFileSync(outPath, JSON.stringify(existingData, null, 2));
      // 1.5s pause between runs to avoid burst rate limiting
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Compute final summary
  for (const item of targetFixtures) {
    const runsForPage = existingData.runs.filter(r => r.fixture === item.file);
    const parseCount = runsForPage.filter(r => r.parsed_valid).length;
    const matchCount = runsForPage.filter(r => r.matched).length;
    existingData.summary[item.file] = {
      expected: item.expected,
      total_runs: runsForPage.length,
      parse_successes: parseCount,
      outcome_matches: matchCount,
      pass_rule_met: (parseCount === 10 && matchCount >= 9),
    };
  }
  existingData.contract_address = probeAddress;
  fs.writeFileSync(outPath, JSON.stringify(existingData, null, 2));
  console.log("\nAll robustness batches completed successfully! Results written to:", outPath);
}

main().catch(err => {
  console.error("Robustness run error:", err);
  process.exit(1);
});
