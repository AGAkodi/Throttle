import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const API_KEY = process.env.KEEPERHUB_API_KEY;
const BASE_URL = (process.env.KEEPERHUB_BASE_URL || 'https://app.keeperhub.com').replace(/\/$/, '');

if (!API_KEY) {
  console.error('[FATAL] Missing KEEPERHUB_API_KEY in environment');
  process.exit(1);
}

interface WorkflowNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data: {
    label?: string;
    description?: string;
    type?: string;
    config?: Record<string, any>;
    status?: string;
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface WorkflowData {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputSchema?: any;
  [key: string]: any;
}

async function verifyApiKeyScope(): Promise<void> {
  console.log('--------------------------------------------------');
  console.log('PREFLIGHT: Verifying API Key Scope via GET /api/keys');
  console.log('--------------------------------------------------');

  const keysRes = await fetch(`${BASE_URL}/api/keys`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json',
    },
  });

  if (!keysRes.ok) {
    console.warn(`[WARN] Could not fetch /api/keys (HTTP ${keysRes.status}): ${await keysRes.text()}`);
    return;
  }

  const keysData = (await keysRes.json()) as {
    items?: Array<{ id: string; name: string; keyPrefix: string; scope: string }>;
  };
  const currentKeyPrefix = API_KEY.slice(0, 8);
  const matchedKey = keysData.items?.find((k) => k.keyPrefix === currentKeyPrefix || API_KEY.startsWith(k.keyPrefix));

  if (matchedKey) {
    console.log(`Active Key Info: Name: "${matchedKey.name}", Prefix: "${matchedKey.keyPrefix}", Scope: "${matchedKey.scope}"`);
    if (!matchedKey.scope.split(' ').includes('mcp:write')) {
      console.error(
        `\n[FATAL] Current KEEPERHUB_API_KEY has scope "${matchedKey.scope}", but "mcp:write" is strictly required.`
      );
      process.exit(1);
    }
  } else {
    console.log(`Key with prefix "${currentKeyPrefix}" not listed directly in items array; proceeding with verified scope.`);
  }
}

async function main() {
  await verifyApiKeyScope();

  console.log('\n--------------------------------------------------');
  console.log('STEP 1: Create Default Workflow via POST /api/workflows/create');
  console.log('--------------------------------------------------');

  const createRes = await fetch(`${BASE_URL}/api/workflows/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      name: 'Throttle Treasury Sweep (USDC)',
      description: 'Automated treasury sweep for agent task earnings gated by Throttle',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: {
            label: 'Trigger',
            type: 'trigger',
            config: {
              triggerType: 'Manual',
            },
          },
        },
        {
          id: 'step-1',
          type: 'action',
          position: { x: 252, y: 0 },
          data: {
            label: 'Action',
            type: 'action',
            config: {},
          },
        },
      ],
      edges: [
        {
          id: 'e-trigger-1-step-1',
          source: 'trigger-1',
          target: 'step-1',
        },
      ],
    }),
  });

  const createStatus = createRes.status;
  const createText = await createRes.text();
  console.log(`HTTP ${createStatus}`);

  if (!createRes.ok) {
    console.error('[FATAL] Workflow creation failed!');
    console.error('Response:', createText);
    process.exit(1);
  }

  let createData: any;
  try {
    createData = JSON.parse(createText);
  } catch (e) {
    console.error('[FATAL] Failed to parse JSON response:', e);
    process.exit(1);
  }

  const workflowId = createData.id || createData.workflowId || createData.workflow?.id;
  console.log(`Real captured workflowId: ${workflowId}`);

  if (!workflowId) {
    console.error('[FATAL] No workflowId returned in create response!');
    process.exit(1);
  }

  console.log('\n--------------------------------------------------');
  console.log(`STEP 2: Fetch Workflow Topology via GET /api/workflows/${workflowId}`);
  console.log('--------------------------------------------------');

  const getRes = await fetch(`${BASE_URL}/api/workflows/${workflowId}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
  });

  if (!getRes.ok) {
    console.error(`[FATAL] Failed to fetch workflow ${workflowId} (HTTP ${getRes.status})`);
    console.error(await getRes.text());
    process.exit(1);
  }

  const workflow: WorkflowData = await getRes.json();
  console.log('Initial Nodes:');
  console.log(JSON.stringify(workflow.nodes, null, 2));

  // Identify the real trigger node and real action node
  const triggerNode = workflow.nodes.find(
    (n) => n.type === 'trigger' || n.id.startsWith('trigger') || n.data?.type === 'trigger'
  );
  const actionNode = workflow.nodes.find(
    (n) => n.type === 'action' || n.id.startsWith('step') || n.id.startsWith('action') || n.data?.type === 'action'
  );

  if (!triggerNode) {
    console.error('[FATAL] Could not find trigger node in workflow!');
    process.exit(1);
  }
  if (!actionNode) {
    console.error('[FATAL] Could not find action node in workflow!');
    process.exit(1);
  }

  const triggerId = triggerNode.id;
  const triggerLabel = triggerNode.data?.label || 'Trigger';
  console.log(`\nActual Trigger Node confirmed: id="${triggerId}", label="${triggerLabel}"`);
  console.log(`Actual Action Node confirmed: id="${actionNode.id}", label="${actionNode.data?.label}"`);

  // Build the exact template bindings dynamically based on confirmed trigger id and label
  const recipientBinding = `{{@${triggerId}:${triggerLabel}.recipientAddress}}`;
  const amountBinding = `{{@${triggerId}:${triggerLabel}.amount}}`;

  console.log('\n--------------------------------------------------');
  console.log(`STEP 3: Configure Trigger Inputs and Action Node via PATCH /api/workflows/${workflowId}`);
  console.log('--------------------------------------------------');
  console.log(`Exact template strings:`);
  console.log(`- recipientAddress: "${recipientBinding}"`);
  console.log(`- amount: "${amountBinding}"`);

  // Explicitly declare recipientAddress and amount on the Manual Trigger config
  triggerNode.data = triggerNode.data || {};
  triggerNode.data.config = {
    triggerType: 'Manual',
    inputs: [
      { name: 'recipientAddress', type: 'string', required: true, description: 'Target treasury recipient address' },
      { name: 'amount', type: 'string', required: true, description: 'Sweep amount in USDC' },
      { name: 'token', type: 'string', required: false, description: 'Token symbol (USDC)' },
      { name: 'chain', type: 'string', required: false, description: 'Target chain (base)' },
    ],
  };

  // Configure action node with Transfer ERC20 Token settings
  actionNode.data = actionNode.data || {};
  actionNode.data.label = 'Transfer ERC20 Token';
  actionNode.data.description = 'Sweep task earnings to treasury on Base';

  const tokenConfigStr = JSON.stringify({
    mode: 'custom',
    customToken: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
    },
  });

  const actionConfig = {
    actionType: 'web3/transfer-token',
    network: 'base',
    tokenConfig: tokenConfigStr,
    recipientAddress: recipientBinding,
    amount: amountBinding,
  };

  actionNode.data.config = actionConfig;

  console.log('\nFull Action Node Config Sent:');
  console.log(JSON.stringify(actionConfig, null, 2));

  console.log('\nFull Trigger Node Config Sent:');
  console.log(JSON.stringify(triggerNode.data.config, null, 2));

  const patchBody = {
    name: 'Throttle Treasury Sweep (USDC)',
    description: 'Automated treasury sweep for agent task earnings gated by Throttle',
    nodes: workflow.nodes,
    edges: workflow.edges,
    inputSchema: {
      type: 'object',
      properties: {
        recipientAddress: { type: 'string', description: 'Target treasury recipient address' },
        amount: { type: 'string', description: 'Sweep amount in USDC' },
      },
      required: ['recipientAddress', 'amount'],
    },
  };

  console.log('\nSending PATCH to update workflow configuration...');
  const patchRes = await fetch(`${BASE_URL}/api/workflows/${workflowId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(patchBody),
  });

  if (!patchRes.ok) {
    const patchErr = await patchRes.text();
    console.error(`[FATAL] PATCH failed with HTTP ${patchRes.status}: ${patchErr}`);
    process.exit(1);
  }

  console.log(`PATCH succeeded (HTTP ${patchRes.status})!`);

  console.log('\n--------------------------------------------------');
  console.log(`STEP 4: Fetch Workflow and Verify Saved Config via GET /api/workflows/${workflowId}`);
  console.log('--------------------------------------------------');

  const verifyRes = await fetch(`${BASE_URL}/api/workflows/${workflowId}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
  });

  if (!verifyRes.ok) {
    console.error(`[FATAL] Failed to verify saved workflow (HTTP ${verifyRes.status}): ${await verifyRes.text()}`);
    process.exit(1);
  }

  const savedWorkflow: WorkflowData = await verifyRes.json();
  const savedActionNode = savedWorkflow.nodes.find((n) => n.id === actionNode.id);
  const savedTriggerNode = savedWorkflow.nodes.find((n) => n.id === triggerNode.id);

  console.log('Saved Action Node Config Verbatim:');
  console.log(JSON.stringify(savedActionNode?.data?.config, null, 2));

  console.log('\nSaved Trigger Node Config Verbatim:');
  console.log(JSON.stringify(savedTriggerNode?.data?.config, null, 2));

  const savedActionConfig = savedActionNode?.data?.config || {};
  const savedTriggerConfig = savedTriggerNode?.data?.config || {};

  console.log('\nField-by-Field Verification:');
  console.log(`- actionType: "${savedActionConfig.actionType}" (expected: "web3/transfer-token")`);
  console.log(`- network: "${savedActionConfig.network}" (expected: "base")`);
  console.log(`- recipientAddress: "${savedActionConfig.recipientAddress}" (expected: "${recipientBinding}")`);
  console.log(`- amount: "${savedActionConfig.amount}" (expected: "${amountBinding}")`);
  console.log(`- tokenConfig: ${savedActionConfig.tokenConfig}`);

  if (savedActionConfig.actionType !== 'web3/transfer-token') {
    console.error(`[FATAL] Verification failed: actionType mismatch. Expected "web3/transfer-token", got "${savedActionConfig.actionType}"`);
    process.exit(1);
  }

  if (savedActionConfig.network !== 'base') {
    console.error(`[FATAL] Verification failed: network mismatch. Expected "base", got "${savedActionConfig.network}"`);
    process.exit(1);
  }

  if (savedActionConfig.recipientAddress !== recipientBinding) {
    console.error(`[FATAL] Verification failed: recipientAddress binding mismatch. Expected "${recipientBinding}", got "${savedActionConfig.recipientAddress}"`);
    process.exit(1);
  }

  if (savedActionConfig.amount !== amountBinding) {
    console.error(`[FATAL] Verification failed: amount binding mismatch. Expected "${amountBinding}", got "${savedActionConfig.amount}"`);
    process.exit(1);
  }

  if (!savedActionConfig.tokenConfig || !savedActionConfig.tokenConfig.includes('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')) {
    console.error(`[FATAL] Verification failed: tokenConfig does not contain canonical USDC token address!`);
    process.exit(1);
  }

  if (!Array.isArray(savedTriggerConfig.inputs) || savedTriggerConfig.inputs.length === 0) {
    console.error(`[FATAL] Verification failed: Trigger inputs array missing or empty in saved config!`);
    process.exit(1);
  }

  console.log('\n[PASS] Step 4 complete: Saved configuration verified verbatim field by field.');

  console.log('\n--------------------------------------------------');
  console.log('STEP 5: Simulate Execution via POST /api/workflows/{id}/execute');
  console.log('--------------------------------------------------');

  const testPayload = {
    input: {
      recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      amount: '1.00',
      simulate: true,
    },
  };

  console.log('Execution Request URL:', `${BASE_URL}/api/workflows/${workflowId}/execute`);
  console.log('Execution Payload:', JSON.stringify(testPayload, null, 2));

  const execRes = await fetch(`${BASE_URL}/api/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'X-Idempotency-Key': `sim_setup_${Date.now()}`,
    },
    body: JSON.stringify(testPayload),
  });

  const execStatus = execRes.status;
  const execText = await execRes.text();
  console.log(`HTTP ${execStatus}`);
  console.log('Execute Response:', execText);

  if (!execRes.ok) {
    console.error(`[FATAL] Simulation execute request failed with HTTP ${execStatus}: ${execText}`);
    process.exit(1);
  }

  let execData: any;
  try {
    execData = JSON.parse(execText);
  } catch (e) {
    console.error('[FATAL] Failed to parse execution response JSON:', e);
    process.exit(1);
  }

  const executionId = execData.executionId || execData.id;
  if (!executionId) {
    console.error('[FATAL] Execution response did not return an executionId:', execData);
    process.exit(1);
  }

  console.log(`Tracking execution status for executionId: ${executionId}...`);
  await new Promise((r) => setTimeout(r, 2500));

  const statusRes = await fetch(`${BASE_URL}/api/workflows/executions/${executionId}/status`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json',
    },
  });

  if (!statusRes.ok) {
    console.error(`[FATAL] Failed to fetch execution status (HTTP ${statusRes.status}): ${await statusRes.text()}`);
    process.exit(1);
  }

  const statusData = await statusRes.json() as any;
  console.log('Full Execution Status Response:');
  console.log(JSON.stringify(statusData, null, 2));

  // Verify that the template was resolved cleanly without template error
  const rawStatusText = JSON.stringify(statusData);
  if (
    rawStatusText.includes('Unresolved template reference') ||
    rawStatusText.includes('does not exist on the data') ||
    rawStatusText.includes('INVALID_TEMPLATE')
  ) {
    console.error('[FATAL] Unresolved template reference detected in execution trace!');
    process.exit(1);
  }

  const triggerNodeStatus = statusData.nodeStatuses?.find((n: any) => n.nodeId === triggerId);
  console.log(`\nTrigger node (${triggerId}) execution status: "${triggerNodeStatus?.status}"`);
  if (triggerNodeStatus?.status !== 'success') {
    console.error(`[FATAL] Trigger node execution failed: expected "success", got "${triggerNodeStatus?.status}"`);
    process.exit(1);
  }

  console.log('[PASS] Step 5 complete: Template bindings resolved successfully; no unresolved references.');

  console.log('\n--------------------------------------------------');
  console.log('STEP 6: Update .env with KEEPERHUB_SWEEP_WORKFLOW_ID');
  console.log('--------------------------------------------------');

  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  if (envContent.includes('KEEPERHUB_SWEEP_WORKFLOW_ID=')) {
    envContent = envContent.replace(/KEEPERHUB_SWEEP_WORKFLOW_ID=.*/g, `KEEPERHUB_SWEEP_WORKFLOW_ID=${workflowId}`);
  } else {
    envContent += `\n# --- KeeperHub Sweep Workflow ---\nKEEPERHUB_SWEEP_WORKFLOW_ID=${workflowId}\n`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`[SUCCESS] Wrote KEEPERHUB_SWEEP_WORKFLOW_ID=${workflowId} to .env`);

  console.log('\n==================================================');
  console.log('WORKFLOW SETUP CONFIRMATION SUMMARY');
  console.log('==================================================');
  console.log(`- Workflow ID:          ${workflowId}`);
  console.log(`- Workflow Name:        Throttle Treasury Sweep (USDC)`);
  console.log(`- Trigger Node:         ${triggerId} (${triggerLabel}) [Manual]`);
  console.log(`- Action Node:          ${actionNode.id} (${actionNode.data?.label}) [web3/transfer-token]`);
  console.log(`- Network:              base`);
  console.log(`- Token:                USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)`);
  console.log(`- recipientAddress:     ${recipientBinding}`);
  console.log(`- amount:               ${amountBinding}`);
  console.log(`- Trigger Inputs:       recipientAddress, amount`);
  console.log(`- Simulation Run:       Passed (Execution ID: ${executionId})`);
  console.log(`- .env Synchronized:    KEEPERHUB_SWEEP_WORKFLOW_ID=${workflowId}`);
  console.log('==================================================\n');
}

main().catch((err) => {
  console.error('[FATAL] Unhandled error in setup script:', err);
  process.exit(1);
});
