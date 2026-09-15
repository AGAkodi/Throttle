import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

import dotenv from 'dotenv';
dotenv.config();

import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatUnits, formatEther, parseAbi, type Hex } from 'viem';
import { base } from 'viem/chains';

const AGENT_WALLET_PRIVATE_KEY = process.env.AGENT_WALLET_PRIVATE_KEY || '';
const KEEPERHUB_ORG_WALLET_ADDRESS =
  process.env.KEEPERHUB_ORG_WALLET_ADDRESS ||
  process.env.KEEPERHUB_WALLET_ADDRESS ||
  '';
const TASKMARKET_BASE_URL = (process.env.TASKMARKET_API_URL || 'https://api.taskmarket.dev').replace(/\/$/, '');
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Hex;

const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

async function main() {
  console.log('================================================================');
  console.log('PRECONDITION CHECK: AGENT WALLET & TASKMARKET LEGAL & BALANCES');
  console.log('================================================================');

  if (!AGENT_WALLET_PRIVATE_KEY) {
    console.error('[FATAL] AGENT_WALLET_PRIVATE_KEY is missing from environment.');
    process.exit(1);
  }

  // 1. Derive address
  const formattedKey = (AGENT_WALLET_PRIVATE_KEY.startsWith('0x')
    ? AGENT_WALLET_PRIVATE_KEY
    : `0x${AGENT_WALLET_PRIVATE_KEY}`) as Hex;
  const agentAccount = privateKeyToAccount(formattedKey);
  const agentAddress = agentAccount.address;

  console.log(`\n1. AGENT_WALLET_PRIVATE_KEY derived address: ${agentAddress}`);
  console.log(`   KEEPERHUB_ORG_WALLET_ADDRESS: ${KEEPERHUB_ORG_WALLET_ADDRESS || '(not set)'}`);

  // 2. Check TaskMarket legal acceptance
  console.log(`\n2. Checking TaskMarket legal acceptance for ${agentAddress}...`);
  let legalStatus: any = null;
  try {
    const statusRes = await fetch(`${TASKMARKET_BASE_URL}/api/legal/status?address=${agentAddress}`, {
      headers: { Accept: 'application/json' },
    });
    console.log(`   GET /api/legal/status status: ${statusRes.status}`);
    if (statusRes.ok) {
      legalStatus = await statusRes.json();
      console.log(`   Legal status response:`, legalStatus);
    } else {
      console.log(`   GET /api/legal/status returned ${statusRes.status}: ${await statusRes.text()}`);
    }
  } catch (err: any) {
    console.log(`   GET /api/legal/status call error: ${err.message}`);
  }

  // Also test /api/legal/challenge or lightweight call to see if accepted or challenge required
  let isAccepted = legalStatus?.accepted === true || legalStatus?.status === 'accepted';

  // 3. If not yet accepted, run acceptance flow
  if (!isAccepted) {
    console.log(`\n3. Address not yet accepted or status endpoint unavailable. Requesting challenge from POST /api/legal/challenge...`);
    try {
      const challengeRes = await fetch(`${TASKMARKET_BASE_URL}/api/legal/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ walletAddress: agentAddress }),
      });

      console.log(`   POST /api/legal/challenge HTTP status: ${challengeRes.status}`);
      const challengeData = (await challengeRes.json()) as any;
      console.log(`   Challenge data:`, JSON.stringify(challengeData, null, 2));

      if (challengeRes.status === 412) {
        console.log(`   [NOTE] TaskMarket legal enforcement is disabled on this deployment:`);
        console.log(`   - enforcementEnabled: false`);
        console.log(`   - acceptanceAvailable: false`);
        console.log(`   - HTTP 412 message: "${challengeData?.message}"`);
        console.log(`   Legal acceptance is not currently enforced by TaskMarket API.`);
      } else if (challengeData?.alreadyAccepted || challengeData?.accepted) {
        console.log(`   TaskMarket reports wallet is already accepted!`);
        isAccepted = true;
      } else if (challengeData?.challenge || challengeData?.message) {
        const messageToSign = challengeData.challenge || challengeData.message;
        console.log(`   Signing challenge message with agent wallet key...`);
        const signature = await agentAccount.signMessage({ message: messageToSign });
        console.log(`   Signature generated: ${signature.slice(0, 32)}...`);

        console.log(`   Submitting signature to POST /api/legal/accept/wallet...`);
        const acceptRes = await fetch(`${TASKMARKET_BASE_URL}/api/legal/accept/wallet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            walletAddress: agentAddress,
            signature,
            challenge: messageToSign,
          }),
        });

        console.log(`   POST /api/legal/accept/wallet HTTP status: ${acceptRes.status}`);
        const acceptData = await acceptRes.json().catch(() => null);
        console.log(`   Accept response:`, JSON.stringify(acceptData, null, 2));

        if (acceptRes.ok) {
          console.log(`   [SUCCESS] Legal acceptance recorded successfully!`);
          isAccepted = true;
        } else {
          console.error(`   [FATAL] Legal acceptance failed with HTTP ${acceptRes.status}:`, acceptData);
        }
      } else {
        console.log(`   Unexpected challenge response structure:`, challengeData);
      }
    } catch (err: any) {
      console.error(`   [FATAL] Error running legal acceptance flow: ${err.message}`);
    }
  } else {
    console.log(`\n3. Legal acceptance already confirmed for ${agentAddress}.`);
  }

  // 4. Balances check
  console.log(`\n4. Fetching Base mainnet balances via RPC (${BASE_RPC_URL})...`);
  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  });

  // Agent balances
  const agentEthBalance = await publicClient.getBalance({ address: agentAddress });
  const agentUsdcBalance = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [agentAddress],
  })) as bigint;

  const agentEthFormatted = formatEther(agentEthBalance);
  const agentUsdcFormatted = formatUnits(agentUsdcBalance, 6);

  console.log(`\n   --- Agent Wallet (${agentAddress}) ---`);
  console.log(`   ETH Balance:  ${agentEthFormatted} ETH`);
  console.log(`   USDC Balance: ${agentUsdcFormatted} USDC (${agentUsdcBalance.toString()} raw units)`);

  // Org wallet balances
  let orgEthBalance = 0n;
  let orgUsdcBalance = 0n;
  let orgEthFormatted = '0';
  let orgUsdcFormatted = '0';

  if (KEEPERHUB_ORG_WALLET_ADDRESS) {
    const orgAddress = KEEPERHUB_ORG_WALLET_ADDRESS as Hex;
    orgEthBalance = await publicClient.getBalance({ address: orgAddress });
    orgUsdcBalance = (await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [orgAddress],
    })) as bigint;
    orgEthFormatted = formatEther(orgEthBalance);
    orgUsdcFormatted = formatUnits(orgUsdcBalance, 6);

    console.log(`\n   --- KeeperHub Org Wallet (${orgAddress}) ---`);
    console.log(`   ETH Balance:  ${orgEthFormatted} ETH`);
    console.log(`   USDC Balance: ${orgUsdcFormatted} USDC (${orgUsdcBalance.toString()} raw units)`);
  } else {
    console.warn(`\n   --- KeeperHub Org Wallet: NOT SET IN ENV ---`);
  }

  // Check requirements:
  // Agent wallet: enough USDC for at least one 0.001 USDC claim fee (1,000 raw units)
  // Org wallet: enough ETH for gas plus enough USDC to match expected sweep amount
  console.log('\n----------------------------------------------------------------');
  console.log('FUNDING & BALANCE VERIFICATION');
  console.log('----------------------------------------------------------------');

  const MIN_AGENT_USDC_RAW = 1000n; // 0.001 USDC
  let fundingNeeded = false;
  const fundingIssues: string[] = [];

  if (agentUsdcBalance < MIN_AGENT_USDC_RAW) {
    fundingNeeded = true;
    fundingIssues.push(
      `Agent wallet (${agentAddress}) has ${agentUsdcFormatted} USDC, but needs at least 0.001 USDC (1,000 raw units) to pay claim fee.`
    );
  }

  if (KEEPERHUB_ORG_WALLET_ADDRESS) {
    // Org wallet needs gas ETH and USDC for sweep
    if (orgEthBalance === 0n) {
      fundingNeeded = true;
      fundingIssues.push(
        `KeeperHub Org wallet (${KEEPERHUB_ORG_WALLET_ADDRESS}) has 0 ETH on Base. It needs ETH for transaction gas to execute the sweep transfer.`
      );
    }
    if (orgUsdcBalance === 0n) {
      fundingNeeded = true;
      fundingIssues.push(
        `KeeperHub Org wallet (${KEEPERHUB_ORG_WALLET_ADDRESS}) has 0 USDC on Base. It needs USDC to transfer during the sweep workflow.`
      );
    }
  }

  if (fundingNeeded) {
    console.error('\n[STOP] INSUFFICIENT BALANCES:');
    for (const issue of fundingIssues) {
      console.error(` - ${issue}`);
    }
    process.exit(2);
  } else {
    console.log('\n[PASS] All balance preconditions met!');
  }
}

main().catch((err) => {
  console.error('[FATAL] Precondition check failed:', err);
  process.exit(1);
});
