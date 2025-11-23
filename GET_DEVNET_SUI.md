# Get Devnet SUI for Your Wallet

Your wallet address: `0x4af17641e31fbc1581458d68f914b9a1ad6c83d9caa370cce172351dbf7f23d6`

## Option 1: Use Sui Devnet Faucet (Easiest)

Visit: https://faucet.devnet.sui.io/

1. Paste your wallet address: `0x4af17641e31fbc1581458d68f914b9a1ad6c83d9caa370cce172351dbf7f23d6`
2. Click "Request Devnet SUI"
3. Wait ~10 seconds for the transaction to complete
4. Refresh your wallet to see the SUI balance

## Option 2: Discord Faucet

1. Join Sui Discord: https://discord.gg/sui
2. Go to #devnet-faucet channel
3. Type: `!faucet 0x4af17641e31fbc1581458d68f914b9a1ad6c83d9caa370cce172351dbf7f23d6`

## After Getting Devnet SUI

Once your wallet shows a SUI balance:

1. Go to: http://localhost:3000/init-votebook
2. Click "Create VoteBook"
3. Copy the new VoteBook ID
4. Update `.env.local` with: `NEXT_PUBLIC_VOTEBOOK_ID=<new-id>`
5. Restart the dev server
6. Test upload again!
