module evala::EvalaReputation {
    use sui::event;
    use sui::table::{Self, Table};

    /// Non-transferable reputation NFT (soulbound by convention; no transfer APIs exposed)
    public struct Reputation has key, store {
        id: object::UID,
        owner: address,
        score: u64,
        task_count: u64,
        /// Track which content_ids have been claimed for reputation
        claimed_rewards: Table<object::ID, bool>,
    }

    public struct ReputationUpdated has copy, drop {
        owner: address,
        score: u64,
        task_count: u64,
        content_id: object::ID,
    }

    /// Mint on first validated task - only mint for self
    public fun mint(owner: address, ctx: &mut tx_context::TxContext) {
        let sender = tx_context::sender(ctx);
        assert!(owner == sender, 1); // Error 1: can only mint for yourself
        
        let rep = Reputation { 
            id: object::new(ctx), 
            owner, 
            score: 0, 
            task_count: 0,
            claimed_rewards: table::new(ctx)
        };
        // Give it to owner; no public transfer or burn functions provided
        transfer::transfer(rep, owner);
    }

    /// Update reputation for a specific reward (can only claim once per content_id)
    /// This should be called by the owner after verifying they won rewards via RewardDistributed event
    public fun claim_reward_reputation(
        rep: &mut Reputation, 
        content_id: object::ID,
        ctx: &tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Only owner can update their own reputation
        assert!(rep.owner == sender, 2); // Error 2: only owner can claim
        
        // Check if already claimed for this content
        assert!(!table::contains(&rep.claimed_rewards, content_id), 3); // Error 3: already claimed for this content
        
        // Fixed reward per validated task
        let delta = 10;
        rep.score = rep.score + delta;
        rep.task_count = rep.task_count + 1;
        
        // Mark as claimed
        table::add(&mut rep.claimed_rewards, content_id, true);
        
        event::emit(ReputationUpdated { 
            owner: rep.owner, 
            score: rep.score, 
            task_count: rep.task_count,
            content_id 
        });
    }

    /// Get the owner address of a Reputation NFT
    public fun get_owner(rep: &Reputation): address {
        rep.owner
    }
    
    /// Check if reputation has been claimed for a content_id
    public fun is_claimed(rep: &Reputation, content_id: object::ID): bool {
        table::contains(&rep.claimed_rewards, content_id)
    }
}
