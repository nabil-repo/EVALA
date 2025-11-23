export const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID as string;
export const VOTEBOOK_ID = process.env.NEXT_PUBLIC_VOTEBOOK_ID as string | undefined;
export const SUI_RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
// Walrus Web API endpoints
export const WALRUS_PUBLISHER_URL = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || '';
export const WALRUS_AGGREGATOR_URL = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || '';

export function typeForContent(): string {
  if (!PACKAGE_ID) throw new Error('NEXT_PUBLIC_PACKAGE_ID is not set');
  console.log("Using PACKAGE_ID:", PACKAGE_ID);
  return `${PACKAGE_ID}::EvalaContent::ContentSet`;
}

export const MODULES = {
  content: 'EvalaContent',
  vote: 'EvalaVote',
  reputation: 'EvalaReputation',
  reward: 'EvalaReward',
  poll: 'EvalaPoll',
};
