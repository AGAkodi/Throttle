/**
 * Dynamic Policy Groups Generator
 * Dynamically synthesizes lucid-agents `PaymentPolicyGroup[]` configurations
 * based on Throttle's real-time AuthorityLevel, risk score, and trust score.
 *
 * NOTE: This is a SECONDARY, coarser client-side filter.
 * The authoritative payment gate is `sign-gate.ts` inside packages/keeperhub-adapter.
 */

import { AuthorityLevel, AgentProfile } from '@throttle/controller';

export interface DynamicPolicyGroup {
  id: string;
  name: string;
  authorityLevel: AuthorityLevel;
  maxPaymentUsd: number;
  maxTotalUsd: number;
  allowedTokens: string[];
  allowedRecipients?: string[];
  requireConfirmation: boolean;
  isHalted: boolean;
}

export function generateDynamicPolicyGroups(profile: AgentProfile): DynamicPolicyGroup[] {
  const level = profile.currentAuthorityLevel;
  const constraints = profile.policyConstraints;
  const baseline = profile.baseline;

  switch (level) {
    case AuthorityLevel.FULL_AUTONOMY: // Level 0
      return [
        {
          id: 'throttle-policy-lvl-0',
          name: 'Throttle: Full Autonomy Policy',
          authorityLevel: level,
          maxPaymentUsd: constraints.maxSingleTransferUsd,
          maxTotalUsd: constraints.maxDailySpendUsd,
          allowedTokens: ['USDC'],
          requireConfirmation: false,
          isHalted: false,
        },
      ];

    case AuthorityLevel.LOGGED_AUTONOMY: // Level 1
      return [
        {
          id: 'throttle-policy-lvl-1',
          name: 'Throttle: Logged Autonomy Policy',
          authorityLevel: level,
          maxPaymentUsd: constraints.maxSingleTransferUsd * 0.8,
          maxTotalUsd: constraints.maxDailySpendUsd * 0.8,
          allowedTokens: ['USDC'],
          requireConfirmation: false,
          isHalted: false,
        },
      ];

    case AuthorityLevel.ENHANCED_MONITORING: // Level 2
      return [
        {
          id: 'throttle-policy-lvl-2',
          name: 'Throttle: Enhanced Monitoring Policy',
          authorityLevel: level,
          maxPaymentUsd: constraints.maxSingleTransferUsd * 0.5,
          maxTotalUsd: constraints.maxDailySpendUsd * 0.5,
          allowedTokens: ['USDC'],
          requireConfirmation: false,
          isHalted: false,
        },
      ];

    case AuthorityLevel.RESTRICTED: // Level 3
      return [
        {
          id: 'throttle-policy-lvl-3',
          name: 'Throttle: Restricted Scope Policy',
          authorityLevel: level,
          maxPaymentUsd: constraints.maxSingleTransferUsd * (constraints.restrictedMultiplier ?? 0.25),
          maxTotalUsd: constraints.maxDailySpendUsd * 0.2,
          allowedTokens: ['USDC'],
          // Restrict to known historical recipients only
          allowedRecipients: baseline.knownDestinations,
          requireConfirmation: false,
          isHalted: false,
        },
      ];

    case AuthorityLevel.APPROVAL_REQUIRED: // Level 4
      return [
        {
          id: 'throttle-policy-lvl-4',
          name: 'Throttle: Human Approval Required Policy',
          authorityLevel: level,
          maxPaymentUsd: 0,
          maxTotalUsd: 0,
          allowedTokens: ['USDC'],
          requireConfirmation: true,
          isHalted: true,
        },
      ];

    case AuthorityLevel.FROZEN: // Level 5
    default:
      return [
        {
          id: 'throttle-policy-lvl-5',
          name: 'Throttle: Frozen Emergency Halt Policy',
          authorityLevel: level,
          maxPaymentUsd: 0,
          maxTotalUsd: 0,
          allowedTokens: [],
          requireConfirmation: true,
          isHalted: true,
        },
      ];
  }
}
