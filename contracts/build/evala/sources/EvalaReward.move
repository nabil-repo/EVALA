module evala::EvalaReward {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::object;
    use sui::tx_context;
    use sui::transfer;
    use evala::EvalaVote::{Self, VoteBook};

    /// Pool funded by a creator for a content id
    public struct RewardPool has key {
        id: object::UID,
        content_id: object::ID,
        creator: address,
        pot: Balance<SUI>,
        distributed: bool,
    }

    public struct RewardDistributed has copy, drop {
        content_id: object::ID,
        total: u64,
        winners: vector<address>,
        winning_variant: u64,
    }

    /// Fund a reward pool for a content id by depositing SUI
    public fun fund(content_id: object::ID, coins: Coin<SUI>, ctx: &mut tx_context::TxContext) {
        let creator = tx_context::sender(ctx);
        let balance = coin::into_balance(coins);
        
        // Minimum funding amount: 0.1 SUI (100M MIST)
        assert!(balance::value(&balance) >= 100_000_000, 10); // Error 10: minimum 0.1 SUI
        let pool = RewardPool { id: object::new(ctx), content_id, creator, pot: balance, distributed: false };
        // Transfer the pool object to creator for lifecycle control
        transfer::transfer(pool, creator);
    }

    /// Distribute rewards: finds winning variant, pays validators who voted correctly
    /// Note: Reputation updates must be done separately by calling update_reputation on each winner's NFT
    public fun distribute_rewards(
        pool: &mut RewardPool, 
        votebook: &VoteBook,
        ctx: &mut tx_context::TxContext
    ) {
        // Access control: only creator can distribute
        let sender = tx_context::sender(ctx);
        assert!(pool.creator == sender, 1); // Error 1: only creator can distribute
        
        // State validation
        assert!(!pool.distributed, 0); // Error 0: already distributed
        assert!(balance::value(&pool.pot) > 0, 2); // Error 2: pool is empty
        
        // Verify voting is closed
        assert!(EvalaVote::is_closed(votebook, pool.content_id), 3); // Error 3: voting must be closed first
        
        // Get winning variant from vote counts
        let winning_variant = EvalaVote::get_winning_variant(votebook, pool.content_id);
        let winners = EvalaVote::get_voters_for_variant(votebook, pool.content_id, winning_variant);
        
        let winner_count = winners.length();
        let total = balance::value(&pool.pot);
        
        if (winner_count > 0) {
            let per_validator = total / winner_count;
            
            // Pay each winner
            let mut i = 0;
            while (i < winner_count) {
                let winner_addr = *winners.borrow(i);
                let reward_balance = balance::split(&mut pool.pot, per_validator);
                let reward_coin = coin::from_balance(reward_balance, ctx);
                transfer::public_transfer(reward_coin, winner_addr);
                i = i + 1;
            };
        };
        
        event::emit(RewardDistributed { 
            content_id: pool.content_id, 
            total,
            winners,
            winning_variant 
        });
        pool.distributed = true;
    }
}
