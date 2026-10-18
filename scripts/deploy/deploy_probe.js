const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { createClient, chains, createAccount } = require('genlayer-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
  console.log("=================================================");
  console.log("COVER: MILESTONE 0 RUNTIME PROBE");
  console.log("=================================================");

  const account = createAccount();
  console.log("Generated throwaway account:", account.address);

  const client = createClient({
    chain: chains.studionet,
    account: account,
  });

  const probePath = path.join(__dirname, '../../contracts/Probe.py');
  const code = fs.readFileSync(probePath, 'utf8');
  const codeSha = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
  console.log("Probe source sha256:", codeSha);

  console.log("\n1. Deploying Probe contract to Studionet (Chain 61999)...");
  const t0 = Date.now();
  const deployTxHash = await client.deployContract({
    code: code,
    args: [],
  });
  console.log("Deploy tx submitted. Hash:", deployTxHash);

  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTxHash,
    retries: 120,
    interval: 3000,
  });
  const deployLatency = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Deploy receipt received in ${deployLatency}s:`);
  console.log("  status_name:", deployReceipt.status_name);
  console.log("  result_name:", deployReceipt.result_name);
  const leaderRes = deployReceipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  console.log("  leader execution_result:", leaderRes);

  const contractAddress = deployReceipt.recipient;
  console.log("Probe contract deployed address:", contractAddress);

  if (!contractAddress || leaderRes !== 'SUCCESS') {
    throw new Error("Probe contract deployment failed: " + JSON.stringify(deployReceipt));
  }

  const results = {
    contractAddress,
    deployTxHash,
    deployLatency,
    codeSha256: codeSha,
    sender: account.address,
    views: {},
    transactions: [],
  };

  // Helper for writes
  async function runWrite(label, functionName, args) {
    console.log(`\n--- Running write: ${label} (${functionName}) ---`);
    const tw0 = Date.now();
    const txHash = await client.writeContract({
      address: contractAddress,
      functionName: functionName,
      args: args,
    });
    console.log("Tx hash submitted:", txHash);
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      retries: 120,
      interval: 3000,
    });
    const lat = ((Date.now() - tw0) / 1000).toFixed(2);
    const lRes = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
    console.log(`Receipt in ${lat}s: status=${receipt.status_name}, result=${receipt.result_name}, leader=${lRes}`);
    results.transactions.push({
      action: label,
      functionName,
      txHash,
      status_name: receipt.status_name,
      result_name: receipt.result_name,
      leader_result: lRes,
      latency_seconds: lat,
    });
    return receipt;
  }

  // 2. Test views
  console.log("\n2. Testing contract views (sender, bool, str, list, int args)...");
  const senderView = await client.readContract({
    address: contractAddress,
    functionName: 'get_sender',
    args: [],
  });
  console.log("get_sender():", senderView);
  results.views.sender = senderView;

  const boolView = await client.readContract({
    address: contractAddress,
    functionName: 'probe_bool',
    args: [],
  });
  console.log("probe_bool():", boolView);
  results.views.probe_bool = boolView;

  const strView = await client.readContract({
    address: contractAddress,
    functionName: 'probe_str',
    args: [],
  });
  console.log("probe_str():", strView);
  results.views.probe_str = strView;

  const listView = await client.readContract({
    address: contractAddress,
    functionName: 'probe_list',
    args: [],
  });
  console.log("probe_list():", listView);
  results.views.probe_list = listView;

  const intArgView = await client.readContract({
    address: contractAddress,
    functionName: 'probe_int_args',
    args: [42],
  });
  console.log("probe_int_args(42):", intArgView);
  results.views.probe_int_args = intArgView;

  // 3. Test imports, int write args, large payload in TreeMap
  console.log("\n3. Testing imports, int write args, and large payload...");
  const largePayload = "X".repeat(4000);
  await runWrite("imports_and_storage", "probe_imports_and_storage", [largePayload, 12345]);

  const envInfo = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['env_info'],
  });
  console.log("env_info readback:", envInfo);
  results.env_info = JSON.parse(envInfo);

  // 4. Test web fetch against commit-pinned raw github URL
  console.log("\n4. Testing web.get against commit-pinned raw github fixture...");
  const pinnedSha = "92c69bc636517656b9e7ee031a503adfb2d26bb4";
  const s0Url = `https://raw.githubusercontent.com/huzyow155/cover-fixtures/${pinnedSha}/status-s0-operational.md`;
  await runWrite("web_fetch_github_raw_md", "probe_web_fetch", [s0Url, "s0_fetch"]);

  const s0Res = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['s0_fetch'],
  });
  console.log("s0_fetch readback:", s0Res);
  results.s0_fetch = JSON.parse(s0Res);

  // 5. Test web fetch against html fixture
  console.log("\n5. Testing web.get against commit-pinned html fixture...");
  const s5Url = `https://raw.githubusercontent.com/huzyow155/cover-fixtures/${pinnedSha}/status-s5-operational-reformatted.html`;
  await runWrite("web_fetch_github_raw_html", "probe_web_fetch", [s5Url, "s5_fetch"]);

  const s5Res = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['s5_fetch'],
  });
  console.log("s5_fetch readback:", s5Res);
  results.s5_fetch = JSON.parse(s5Res);

  // 6. Test web fetch against 404 URL
  console.log("\n6. Testing web.get against 404 URL...");
  const notFoundUrl = `https://raw.githubusercontent.com/huzyow155/cover-fixtures/${pinnedSha}/non-existent-page.md`;
  await runWrite("web_fetch_404", "probe_web_fetch", [notFoundUrl, "fetch_404"]);

  const f404Res = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['fetch_404'],
  });
  console.log("fetch_404 readback:", f404Res);
  results.fetch_404 = JSON.parse(f404Res);

  // 7. Test byte stability across 5 fetches
  console.log("\n7. Testing byte stability across 5 fetches...");
  await runWrite("byte_stability", "probe_byte_stability", [s0Url, 5]);

  const stabRes = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['stability'],
  });
  console.log("stability readback:", stabRes);
  results.stability = JSON.parse(stabRes);

  // 8. Test LLM exec_prompt
  console.log("\n8. Testing LLM exec_prompt...");
  const testPrompt = JSON.stringify({
    task: "Output JSON exactly matching: {\"status\": \"OPERATIONAL\", \"minutes\": 0, \"quote\": \"\"}. Output nothing else."
  });
  await runWrite("llm_prompt", "probe_llm_prompt", [testPrompt]);

  const llmOut = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['llm_out'],
  });
  console.log("llm_out readback:", llmOut);
  results.llm_out = llmOut;

  // 9. Test run_nondet pattern with post-mutation
  console.log("\n9. Testing gl.vm.run_nondet pattern with state mutation...");
  await runWrite("run_nondet_pattern", "probe_run_nondet_pattern", [testPrompt]);

  const nondetRes = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['run_nondet_res'],
  });
  console.log("run_nondet_res readback:", nondetRes);
  results.run_nondet_res = nondetRes;

  const outPath = path.join(__dirname, 'probe_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log("\nProbe results saved successfully to:", outPath);
}

main().catch(err => {
  console.error("Probe script error:", err);
  process.exit(1);
});
