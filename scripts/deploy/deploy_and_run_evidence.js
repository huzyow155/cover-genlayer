const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { createClient, chains, createAccount } = require('genlayer-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helper to decode base64 error payload
function decodeErrorPayload(receipt) {
  const payload = receipt.consensus_data?.leader_receipt?.[0]?.result?.payload;
  if (!payload) return "";
  try {
    return Buffer.from(payload, 'base64').toString('utf8');
  } catch (e) {
    return String(payload);
  }
}

// Receipt verification rule from Section 16 & 17
function verifyReceiptSuccess(receipt, desc) {
  const statusOk = receipt.status_name === 'ACCEPTED' || receipt.status_name === 'FINALIZED';
  const resultOk = receipt.result_name === 'MAJORITY_AGREE';
  const leaderRes = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  const leaderOk = leaderRes === 'SUCCESS';

  if (!statusOk || !resultOk || !leaderOk) {
    const errText = decodeErrorPayload(receipt);
    throw new Error(`Write transaction failed [${desc}]: status=${receipt.status_name}, result=${receipt.result_name}, leader=${leaderRes}, error=${errText}`);
  }
}

async function retryAsync(fn, desc, maxRetries = 15) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e.message || String(e);
      let waitSeconds = 5;
      if (e.cause?.data?.retry_after_seconds) {
        waitSeconds = e.cause.data.retry_after_seconds + 3;
      } else if (msg.includes("Rate limit") || msg.includes("500 requests")) {
        waitSeconds = 30;
      }
      console.warn(`  [${desc}] Attempt ${attempt}/${maxRetries} failed: ${msg.slice(0, 90)}. Backing off for ${waitSeconds}s...`);
      if (attempt === maxRetries) throw e;
      await new Promise(r => setTimeout(r, waitSeconds * 1000));
    }
  }
}

async function waitForReceiptWithRetry(client, txHash, retries = 150, interval = 3500) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      return await client.waitForTransactionReceipt({
        hash: txHash,
        retries: retries,
        interval: interval,
      });
    } catch (err) {
      const msg = err.message || "";
      let waitSec = 5;
      if (err.cause?.data?.retry_after_seconds) {
        waitSec = err.cause.data.retry_after_seconds + 3;
      } else if (msg.includes("Rate limit")) {
        waitSec = 30;
      }
      if (attempt === 20) throw err;
      console.warn(`Transient RPC error while waiting for receipt (${msg.slice(0, 80)}...). Retrying receipt poll in ${waitSec}s (attempt ${attempt}/20)...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }
}

async function main() {
  console.log("==================================================================");
  console.log("COVER: MILESTONE 4 FULL ON-CHAIN EVIDENCE RUNS ON STUDIONET");
  console.log("==================================================================");

  const underwriter = createAccount();
  const buyer = createAccount();
  console.log("Underwriter account:", underwriter.address);
  console.log("Buyer account:      ", buyer.address);

  const clientUnderwriter = createClient({ chain: chains.studionet, account: underwriter });
  const clientBuyer = createClient({ chain: chains.studionet, account: buyer });

  const coverPath = path.join(__dirname, '../../contracts/Cover.py');
  const guardPath = path.join(__dirname, '../../contracts/CoverGuard.py');
  const coverCode = fs.readFileSync(coverPath, 'utf8');
  const guardCode = fs.readFileSync(guardPath, 'utf8');
  const coverSha256 = crypto.createHash('sha256').update(coverCode, 'utf8').digest('hex');
  const guardSha256 = crypto.createHash('sha256').update(guardCode, 'utf8').digest('hex');

  console.log("\n1. Deploying Cover Contract...");
  const t0 = Date.now();
  const deployCoverTx = await retryAsync(() => clientUnderwriter.deployContract({ code: coverCode, args: [] }), "Deploy Cover");
  console.log("Cover deploy tx submitted:", deployCoverTx);
  const coverDeployReceipt = await waitForReceiptWithRetry(clientUnderwriter, deployCoverTx);
  verifyReceiptSuccess(coverDeployReceipt, "Deploy Cover");
  const coverAddress = coverDeployReceipt.recipient;
  const coverDeployLat = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Cover deployed at: ${coverAddress} in ${coverDeployLat}s`);

  console.log("\n2. Deploying CoverGuard Contract...");
  const tg0 = Date.now();
  const deployGuardTx = await retryAsync(() => clientUnderwriter.deployContract({ code: guardCode, args: [coverAddress] }), "Deploy CoverGuard");
  console.log("CoverGuard deploy tx submitted:", deployGuardTx);
  const guardDeployReceipt = await waitForReceiptWithRetry(clientUnderwriter, deployGuardTx);
  verifyReceiptSuccess(guardDeployReceipt, "Deploy CoverGuard");
  const guardAddress = guardDeployReceipt.recipient;
  const guardDeployLat = ((Date.now() - tg0) / 1000).toFixed(2);
  console.log(`CoverGuard deployed at: ${guardAddress} in ${guardDeployLat}s`);

  // Write deployments.json
  const deployments = {
    network: "studionet",
    chain_id: 61999,
    rpc: "https://studio.genlayer.com/api",
    explorer_base: "https://explorer-studio.genlayer.com/address/",
    cover: {
      address: coverAddress,
      deploy_tx: deployCoverTx,
      source_sha256: coverSha256,
      latency_seconds: coverDeployLat,
    },
    cover_guard: {
      address: guardAddress,
      deploy_tx: deployGuardTx,
      source_sha256: guardSha256,
      latency_seconds: guardDeployLat,
    },
  };
  fs.writeFileSync(path.join(__dirname, 'deployments.json'), JSON.stringify(deployments, null, 2));

  const evidence = {
    deployments,
    transactions: [],
    readbacks: {},
  };

  async function executeWrite(client, label, addr, fn, args, expectSuccess = true) {
    console.log(`\n--- Write: ${label} (${fn}) ---`);
    const tw0 = Date.now();
    const txHash = await retryAsync(() => client.writeContract({
      address: addr,
      functionName: fn,
      args: args,
    }), `writeContract ${label}`);
    console.log(`Tx submitted: ${txHash}`);

    const receipt = await waitForReceiptWithRetry(client, txHash);
    const lat = ((Date.now() - tw0) / 1000).toFixed(2);
    const leaderRes = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
    const errText = decodeErrorPayload(receipt);

    console.log(`Receipt in ${lat}s: status=${receipt.status_name}, result=${receipt.result_name}, leader=${leaderRes}`);
    if (errText) console.log(`Decoded payload: ${errText}`);

    if (expectSuccess) {
      verifyReceiptSuccess(receipt, label);
    }

    const rec = {
      label,
      function: fn,
      tx_hash: txHash,
      status_name: receipt.status_name,
      result_name: receipt.result_name,
      leader_result: leaderRes,
      error_payload: errText,
      latency_seconds: lat,
      expected_success: expectSuccess,
    };
    evidence.transactions.push(rec);
    return { receipt, errText, lat };
  }

  // --- Step A: Setup & Funding ---
  console.log("\n================ STEP A: SETUP & CREDITS ================");
  await executeWrite(clientUnderwriter, "claim_demo_credits_underwriter", coverAddress, "claim_demo_credits", []);
  await executeWrite(clientBuyer, "claim_demo_credits_buyer", coverAddress, "claim_demo_credits", []);

  const pinnedSha = "92c69bc636517656b9e7ee031a503adfb2d26bb4";
  const rawBase = `https://raw.githubusercontent.com/huzyow155/cover-fixtures/${pinnedSha}/`;
  const s0Url = rawBase + "status-s0-operational.md";
  const s1Url = rawBase + "status-s1-outage-75.md";
  const s2Url = rawBase + "status-s2-outage-35.md";
  const s3Url = rawBase + "status-s3-outage-20.md";
  const s4Url = rawBase + "status-s4-degraded-90.md";
  const s5Url = rawBase + "status-s5-operational-reformatted.html";
  const s6Url = rawBase + "status-s6-injection.md";
  const s7Url = rawBase + "status-s7-no-duration.md";
  const s8Url = rawBase + "status-s8-already-down.md";
  const s9Url = rawBase + "status-s9-too-short.md";

  // Create Product: min_full=60, min_half=30, premium_bps=1000
  await executeWrite(
    clientUnderwriter,
    "create_product",
    coverAddress,
    "create_product",
    ["Nimbus Cloud Outage Cover", s0Url, "major outage lasting at least 60 minutes", 60, 30, 1000]
  );

  // Fund product pool with 600 credits
  await executeWrite(clientUnderwriter, "fund_product", coverAddress, "fund_product", ["1", 600]);

  // Read pool health
  const poolHealthA = await clientUnderwriter.readContract({
    address: coverAddress,
    functionName: "pool_health",
    args: ["1"],
  });
  console.log("pool_health after funding:", poolHealthA);
  evidence.readbacks.pool_health_initial = JSON.parse(poolHealthA);

  // --- Step B: Buy Policies ---
  console.log("\n================ STEP B: BUY POLICIES ================");
  // Buy Pa (coverage 100, premium 10)
  await executeWrite(clientBuyer, "buy_policy_Pa", coverAddress, "buy", ["1", 100]);
  // Buy Pb (coverage 100, premium 10)
  await executeWrite(clientBuyer, "buy_policy_Pb", coverAddress, "buy", ["1", 100]);
  // Buy Pc (coverage 100, premium 10)
  await executeWrite(clientBuyer, "buy_policy_Pc", coverAddress, "buy", ["1", 100]);
  // Buy Pd (coverage 100, premium 10)
  await executeWrite(clientBuyer, "buy_policy_Pd", coverAddress, "buy", ["1", 100]);

  // Refused Buy: update source to s8 (already down) and attempt buy -> must fail
  await executeWrite(clientUnderwriter, "update_source_s8", coverAddress, "update_source", ["1", s8Url]);
  const buyS8Res = await executeWrite(clientBuyer, "buy_refused_s8", coverAddress, "buy", ["1", 100], false);
  console.log("buy on s8 error:", buyS8Res.errText);

  // Restore source to s0
  await executeWrite(clientUnderwriter, "update_source_s0", coverAddress, "update_source", ["1", s0Url]);

  // --- Step C: CoverGuard Attestation Before Settlement ---
  console.log("\n================ STEP C: COVERGUARD BEFORE SETTLEMENT ================");
  const isCoveredBefore = await clientBuyer.readContract({
    address: guardAddress,
    functionName: "is_covered",
    args: [buyer.address, "1"],
  });
  console.log("CoverGuard is_covered(Pa) before settlement:", isCoveredBefore);
  evidence.readbacks.is_covered_before = JSON.parse(isCoveredBefore);

  await executeWrite(clientBuyer, "guard_attest_Pa_before", guardAddress, "attest", ["1"]);

  // --- Step D: Walk & Settle Positive, Negative, Escalate Cases ---
  console.log("\n================ STEP D: WALK AND SETTLE ================");
  // Settle Pa against s1 (75 min outage) -> PAY_100
  await executeWrite(clientUnderwriter, "update_source_s1", coverAddress, "update_source", ["1", s1Url]);
  await executeWrite(clientBuyer, "settle_Pa_s1_PAY_100", coverAddress, "settle", ["1"]);

  // Settle Pb against s2 (35 min outage) -> PAY_50
  await executeWrite(clientUnderwriter, "update_source_s2", coverAddress, "update_source", ["1", s2Url]);
  await executeWrite(clientBuyer, "settle_Pb_s2_PAY_50", coverAddress, "settle", ["2"]);

  // Settle Pc against s4 (90 min degraded) -> PAY_25
  await executeWrite(clientUnderwriter, "update_source_s4", coverAddress, "update_source", ["1", s4Url]);
  await executeWrite(clientBuyer, "settle_Pc_s4_PAY_25", coverAddress, "settle", ["3"]);

  // Settle Pd against s3 (20 min outage) -> NO_PAY (remains ACTIVE)
  await executeWrite(clientUnderwriter, "update_source_s3", coverAddress, "update_source", ["1", s3Url]);
  await executeWrite(clientBuyer, "settle_Pd_s3_NO_PAY", coverAddress, "settle", ["4"]);

  // Settle Pd against s5 (reformatted html operational) -> NO_PAY
  await executeWrite(clientUnderwriter, "update_source_s5", coverAddress, "update_source", ["1", s5Url]);
  await executeWrite(clientBuyer, "settle_Pd_s5_NO_PAY", coverAddress, "settle", ["4"]);

  // Settle Pd against s6 (injection prompt) -> REVIEW (tripwire)
  await executeWrite(clientUnderwriter, "update_source_s6", coverAddress, "update_source", ["1", s6Url]);
  await executeWrite(clientBuyer, "settle_Pd_s6_REVIEW_tripwire", coverAddress, "settle", ["4"]);

  // Settle Pd against s7 (no duration) -> REVIEW
  await executeWrite(clientUnderwriter, "update_source_s7", coverAddress, "update_source", ["1", s7Url]);
  await executeWrite(clientBuyer, "settle_Pd_s7_REVIEW_no_duration", coverAddress, "settle", ["4"]);

  // Settle Pd against s0 -> PAGE_UNCHANGED gate (NO_PAY)
  await executeWrite(clientUnderwriter, "update_source_s0_again", coverAddress, "update_source", ["1", s0Url]);
  await executeWrite(clientBuyer, "settle_Pd_s0_PAGE_UNCHANGED", coverAddress, "settle", ["4"]);

  // Duplicate observation error on repeat settle of Pd on s0
  const dupRes = await executeWrite(clientBuyer, "settle_Pd_duplicate_observation", coverAddress, "settle", ["4"], false);
  console.log("duplicate observation error:", dupRes.errText);

  // --- Step E: Error Cases on Settle & Update Source ---
  console.log("\n================ STEP E: ERROR CASES ================");
  // 404 URL
  const notFoundUrl = rawBase + "non-existent-page.md";
  await executeWrite(clientUnderwriter, "update_source_404", coverAddress, "update_source", ["1", notFoundUrl]);
  const err404Res = await executeWrite(clientBuyer, "settle_404_error", coverAddress, "settle", ["4"], false);
  console.log("404 error:", err404Res.errText);

  // s9 too short
  await executeWrite(clientUnderwriter, "update_source_s9", coverAddress, "update_source", ["1", s9Url]);
  const errShortRes = await executeWrite(clientBuyer, "settle_s9_too_short", coverAddress, "settle", ["4"], false);
  console.log("too short error:", errShortRes.errText);

  // update_source host/directory mismatch
  const badMismatchUrl = "https://evil.attacker.example/status.md";
  const errMismatchRes = await executeWrite(clientUnderwriter, "update_source_mismatch", coverAddress, "update_source", ["1", badMismatchUrl], false);
  console.log("mismatch error:", errMismatchRes.errText);

  // Restore to s0
  await executeWrite(clientUnderwriter, "restore_source_s0", coverAddress, "update_source", ["1", s0Url]);

  // --- Step F: Cancel, Withdraw & Over-Withdraw ---
  console.log("\n================ STEP F: CANCEL & WITHDRAW ================");
  // Cancel Pd
  await executeWrite(clientBuyer, "cancel_policy_Pd", coverAddress, "cancel", ["4"]);

  // Withdraw unreserved from pool
  await executeWrite(clientUnderwriter, "withdraw_unreserved", coverAddress, "withdraw_unreserved", ["1", 50]);

  // Over-withdraw error
  const overWithdrawRes = await executeWrite(clientUnderwriter, "withdraw_over_unreserved", coverAddress, "withdraw_unreserved", ["1", 10000], false);
  console.log("over-withdraw error:", overWithdrawRes.errText);

  // --- Step G: CoverGuard Verification After Settle ---
  console.log("\n================ STEP G: COVERGUARD POST-SETTLE ================");
  // Check is_covered for Pa (now PAID)
  const isCoveredAfter = await clientBuyer.readContract({
    address: guardAddress,
    functionName: "is_covered",
    args: [buyer.address, "1"],
  });
  console.log("CoverGuard is_covered(Pa) after settlement:", isCoveredAfter);
  evidence.readbacks.is_covered_after = JSON.parse(isCoveredAfter);

  // Attest on Pa now fails with "not covered: PAID"
  const attestPaidRes = await executeWrite(clientBuyer, "guard_attest_Pa_paid_error", guardAddress, "attest", ["1"], false);
  console.log("attest after paid error:", attestPaidRes.errText);

  // Test is_covered_for with altered terms_hash
  const prodRaw = await clientUnderwriter.readContract({
    address: coverAddress,
    functionName: "get_product",
    args: ["1"],
  });
  const prodObj = JSON.parse(prodRaw);
  const correctTermsHash = prodObj.terms_hash;
  const forgedTermsHash = "0000000000000000000000000000000000000000000000000000000000000000";

  const isCoveredForCorrect = await clientBuyer.readContract({
    address: guardAddress,
    functionName: "is_covered_for",
    args: [buyer.address, "1", "1", correctTermsHash, 50],
  });
  const isCoveredForForged = await clientBuyer.readContract({
    address: guardAddress,
    functionName: "is_covered_for",
    args: [buyer.address, "1", "1", forgedTermsHash, 50],
  });
  evidence.readbacks.is_covered_for_correct = isCoveredForCorrect;
  evidence.readbacks.is_covered_for_forged = isCoveredForForged;
  console.log("is_covered_for correct terms:", isCoveredForCorrect);
  console.log("is_covered_for forged terms:", isCoveredForForged);

  // --- Step H: Balances, Counters & Invariants Readbacks ---
  console.log("\n================ STEP H: STATS & INVARIANTS ================");
  const underwriterBal = await clientUnderwriter.readContract({
    address: coverAddress,
    functionName: "balance_of",
    args: [underwriter.address],
  });
  const buyerBal = await clientBuyer.readContract({
    address: coverAddress,
    functionName: "balance_of",
    args: [buyer.address],
  });
  const finalPoolHealth = await clientUnderwriter.readContract({
    address: coverAddress,
    functionName: "pool_health",
    args: ["1"],
  });
  const stats = await clientUnderwriter.readContract({
    address: coverAddress,
    functionName: "get_stats",
    args: [],
  });

  evidence.readbacks.underwriter_balance = underwriterBal;
  evidence.readbacks.buyer_balance = buyerBal;
  evidence.readbacks.pool_health_final = JSON.parse(finalPoolHealth);
  evidence.readbacks.stats = JSON.parse(stats);

  console.log("Final underwriter balance:", underwriterBal);
  console.log("Final buyer balance:      ", buyerBal);
  console.log("Final pool health:        ", finalPoolHealth);
  console.log("Final stats:              ", stats);

  // Read back individual settlements for Pa, Pb, Pc, Pd
  for (let s = 1; s <= 7; s++) {
    try {
      const sRaw = await clientUnderwriter.readContract({
        address: coverAddress,
        functionName: "get_settlement",
        args: [String(s)],
      });
      evidence.readbacks[`settlement_${s}`] = JSON.parse(sRaw);
    } catch (e) {}
  }

  const outEvidencePath = path.join(__dirname, '../../docs/evidence/live_evidence.json');
  fs.writeFileSync(outEvidencePath, JSON.stringify(evidence, null, 2));
  console.log("\n==================================================================");
  console.log("All Milestone 4 live on-chain runs completed successfully!");
  console.log("Saved evidence to:", outEvidencePath);
  console.log("==================================================================");
}

main().catch(err => {
  console.error("Evidence run fatal error:", err);
  process.exit(1);
});
