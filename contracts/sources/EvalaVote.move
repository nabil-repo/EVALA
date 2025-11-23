module evala::EvalaVote {
    use sui::event;
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};

    /// Holds vote counts per content id as a vector of counts by variant index
    public struct VoteBook has key {
        id: object::UID,
        /// content_id -> counts per variant
        counts: Table<object::ID, vector<u64>>,
        /// content_id -> creator address (to prevent creator voting)
        creators: Table<object::ID, address>,
        /// content_id -> closed status
        closed: Table<object::ID, bool>,
        /// content_id -> map of (voter_address -> variant_index) to track who voted what
        voter_choices: Table<object::ID, VecMap<address, u64>>,
    }

    public struct VoteSubmitted has copy, drop {
        content_id: object::ID,
        variant_index: u64,
        voter: address,
    }

    /// Create a new shared VoteBook once per deployment
    fun init(ctx: &mut tx_context::TxContext) {
        let vb = VoteBook { 
            id: object::new(ctx), 
            counts: table::new(ctx), 
            creators: table::new(ctx),
            closed: table::new(ctx),
            voter_choices: table::new(ctx)
        };
        // Share so anyone can vote/update
        transfer::share_object(vb);
    }

    /// Manually create a new VoteBook (useful after upgrades)
    public fun create_votebook(ctx: &mut tx_context::TxContext) {
        let vb = VoteBook { 
            id: object::new(ctx), 
            counts: table::new(ctx), 
            creators: table::new(ctx),
            closed: table::new(ctx),
            voter_choices: table::new(ctx)
        };
        transfer::share_object(vb);
    }

    /// Index a content creator; restricted to this package
    public(package) fun index_creator(vb: &mut VoteBook, content_id: object::ID, creator: address) {
        let exists = table::contains(&vb.creators, content_id);
        if (!exists) {
            table::add(&mut vb.creators, content_id, creator);
        }
    }

    /// Close voting for a content; only creator can call (verified at call site)
    public fun close_voting(vb: &mut VoteBook, content_id: object::ID, ctx: &tx_context::TxContext) {
        let sender = tx_context::sender(ctx);
        
        // Verify sender is the creator
        assert!(table::contains(&vb.creators, content_id), 102); // Content not found
        let creator = *table::borrow(&vb.creators, content_id);
        assert!(sender == creator, 103); // Only creator can close
        
        // Mark as closed
        if (table::contains(&vb.closed, content_id)) {
            let closed_ref = table::borrow_mut(&mut vb.closed, content_id);
            *closed_ref = true;
        } else {
            table::add(&mut vb.closed, content_id, true);
        };
    }

    /// Check if voting is closed for a content
    public fun is_closed(vb: &VoteBook, content_id: object::ID): bool {
        if (!table::contains(&vb.closed, content_id)) return false;
        *table::borrow(&vb.closed, content_id)
    }

    /// Submit a vote for a given content id and variant index
    public fun submit_vote(vb: &mut VoteBook, content_id: object::ID, variant_index: u64, ctx: &tx_context::TxContext) {
        let voter = tx_context::sender(ctx);
        
        // Input validation
        assert!(variant_index < 10, 105); // Error 105: variant index too high (max 10)
        
        // Check if voting is closed
        if (table::contains(&vb.closed, content_id)) {
            let is_closed = *table::borrow(&vb.closed, content_id);
            assert!(!is_closed, 101); // Error code 101: voting closed
        };
        
        // Prevent the original creator from voting on their own content if indexed
        if (table::contains(&vb.creators, content_id)) {
            let cr_ref = table::borrow(&vb.creators, content_id);
            let cr = *cr_ref;
            assert!(voter != cr, 100);
        };
        
        // Check for duplicate voting FIRST (before incrementing counts)
        if (!table::contains(&vb.voter_choices, content_id)) {
            table::add(&mut vb.voter_choices, content_id, vec_map::empty());
        };
        let choices_ref = table::borrow_mut(&mut vb.voter_choices, content_id);
        assert!(!vec_map::contains(choices_ref, &voter), 104); // Error 104: already voted
        
        // Now increment vote count
        let has = table::contains(&vb.counts, content_id);
        if (!has) {
            table::add(&mut vb.counts, content_id, vector[]);
        };
        let counts_ref = table::borrow_mut(&mut vb.counts, content_id);
        ensure_len(counts_ref, variant_index + 1);
        let current = *vector::borrow(counts_ref, variant_index);
        *vector::borrow_mut(counts_ref, variant_index) = current + 1;
        
        // Record voter's choice
        vec_map::insert(choices_ref, voter, variant_index);
        
        event::emit(VoteSubmitted { content_id, variant_index, voter });
    }

    /// Get the current vote count for a content and variant
    public fun get_vote_count(vb: &VoteBook, content_id: object::ID, variant_index: u64): u64 {
        if (!table::contains(&vb.counts, content_id)) return 0;
        let counts_ref = table::borrow(&vb.counts, content_id);
        if ((variant_index as u64) >= vector::length(counts_ref)) return 0;
        *vector::borrow(counts_ref, variant_index)
    }

    /// Get winning variant (highest vote count)
    public fun get_winning_variant(vb: &VoteBook, content_id: object::ID): u64 {
        if (!table::contains(&vb.counts, content_id)) return 0;
        let counts_ref = table::borrow(&vb.counts, content_id);
        let len = vector::length(counts_ref);
        if (len == 0) return 0;
        
        let mut max_votes = 0;
        let mut winner = 0;
        let mut i = 0;
        
        while (i < len) {
            let votes = *vector::borrow(counts_ref, i);
            if (votes > max_votes) {
                max_votes = votes;
                winner = i;
            };
            i = i + 1;
        };
        
        winner
    }

    /// Get all voters who voted for a specific variant
    public fun get_voters_for_variant(vb: &VoteBook, content_id: object::ID, variant_index: u64): vector<address> {
        if (!table::contains(&vb.voter_choices, content_id)) return vector[];
        
        let choices_ref = table::borrow(&vb.voter_choices, content_id);
        let mut winners = vector[];
        let mut i = 0;
        let size = vec_map::length(choices_ref);
        
        while (i < size) {
            let (voter, voted_variant) = vec_map::get_entry_by_idx(choices_ref, i);
            if (*voted_variant == variant_index) {
                vector::push_back(&mut winners, *voter);
            };
            i = i + 1;
        };
        
        winners
    }

    fun ensure_len(v: &mut vector<u64>, n: u64) {
        let mut i = vector::length(v);
        while (i < n) {
            vector::push_back(v, 0);
            i = i + 1;
        }
    }
}
