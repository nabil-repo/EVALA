module evala::EvalaPoll {
    use sui::event;
    use sui::dynamic_field as df;
    use sui::clock;

    /// Poll object representing a voting session for a content_id
    public struct Poll has key, store {
        id: object::UID,
        content_id: object::ID,
        creator: address,
        /// Unix timestamp in millis when voting closes
        end_time_ms: u64,
        /// If true, UI should require zkLogin; cannot be enforced on-chain
        require_zklogin: bool,
        /// Marks poll as closed (creator can close early)
        closed: bool,
    }

    /// Child record: vote counts per variant
    public struct VariantVotes has store {
        count: u64,
    }

    /// Marker value for dynamic field that tracks if an address has voted
    public struct VotedMarker has store { _unused: bool }

    /// Dynamic field name wrappers
    public struct VarKey has copy, drop, store { i: u64 }
    public struct VoterKey has copy, drop, store { a: address }
    public struct StakeKey has copy, drop, store { a: address, i: u64 }

    public struct PollCreated has copy, drop {
        poll_address: address,
        content_id: ID,
        creator: address,
        end_time_ms: u64,
        require_zklogin: bool,
        variants: u64,
    }

    public struct PrivateVoteSubmitted has copy, drop {
        poll_address: address,
        content_id: ID,
        variant_index: u64,
        /// Opaque proof reference stored off-chain (e.g., Walrus ID)
        proof_cid: vector<u8>,
    }

    public struct PredictionStaked has copy, drop {
        poll_address: address,
        content_id: ID,
        variant_index: u64,
        amount: u64,
        staker: address,
    }

    public struct PollClosed has copy, drop {
        poll_address: address,
        content_id: ID,
        winning_variant: u64,
        total_votes: u64,
    }

    /// Create a new poll bound to a given content_id.
    /// This initializes dynamic fields for each variant with zero votes.
    public fun create_poll(
        content_id: object::ID,
        variants: u64,
        end_time_ms: u64,
        require_zklogin: bool,
        ctx: &mut tx_context::TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        let mut uid = object::new(ctx);

        // Initialize VariantVotes dynamic fields [0..variants)
        let mut i = 0;
        while (i < variants) {
            df::add<VarKey, VariantVotes>(&mut uid, VarKey { i }, VariantVotes { count: 0 });
            i = i + 1;
        };

        let poll = Poll { id: uid, content_id, creator: sender, end_time_ms, require_zklogin, closed: false };
        let poll_address = object::uid_to_address(&poll.id);
        event::emit(PollCreated { poll_address, content_id, creator: sender, end_time_ms, require_zklogin, variants });
        // Share poll so anyone can participate
        transfer::share_object(poll);
    }

    /// Submit a private vote with an off-chain proof reference (e.g., Walrus ID).
    /// For privacy, we avoid emitting voter address in the event.
    public fun submit_vote_private(
        poll: &mut Poll,
        variant_index: u64,
        proof_cid: vector<u8>,
        cl: &clock::Clock,
        ctx: &tx_context::TxContext,
    ) {
        // Require poll open
        assert!(!poll.closed, 1);
        let now = clock::timestamp_ms(cl);
        assert!(now <= poll.end_time_ms, 2);

        let sender = tx_context::sender(ctx);

        // One-vote-per-address: track using dynamic field keyed by address
        assert!(!df::exists_<VoterKey>(&poll.id, VoterKey { a: sender }), 3);
        df::add<VoterKey, VotedMarker>(&mut poll.id, VoterKey { a: sender }, VotedMarker { _unused: true });

        // Increment variant vote count
        let vv_ref = df::borrow_mut<VarKey, VariantVotes>(&mut poll.id, VarKey { i: variant_index });
        vv_ref.count = vv_ref.count + 1;

        let poll_address = object::uid_to_address(&poll.id);
        event::emit(PrivateVoteSubmitted { poll_address, content_id: poll.content_id, variant_index, proof_cid });
    }

    /// Record a staking commitment (amount in MIST) for a given variant.
    /// Note: This scaffolds staking without custody; use for signaling/UX until full custody flows are added.
    public fun stake_prediction_commit(
        poll: &mut Poll,
        variant_index: u64,
        amount_mist: u64,
        cl: &clock::Clock,
        ctx: &tx_context::TxContext,
    ) {
        assert!(!poll.closed, 10);
        let now = clock::timestamp_ms(cl);
        assert!(now <= poll.end_time_ms, 11);

        // Track stake by unique key = (sender, variant)
        let sender = tx_context::sender(ctx);
        // Only allow a single commitment per (sender, variant)
        assert!(!df::exists_<StakeKey>(&poll.id, StakeKey { a: sender, i: variant_index }), 12);
        df::add<StakeKey, u64>(&mut poll.id, StakeKey { a: sender, i: variant_index }, amount_mist);

        let poll_address = object::uid_to_address(&poll.id);
        event::emit(PredictionStaked { poll_address, content_id: poll.content_id, variant_index, amount: amount_mist, staker: sender });
    }

    /// Close poll and emit winner.
    public fun close_poll(poll: &mut Poll) {
        assert!(!poll.closed, 20);
        poll.closed = true;

        // Find winner by scanning variant counts. If no variants, winner = 0.
        let mut index: u64 = 0;
        let mut best_idx: u64 = 0;
        let mut best_count: u64 = 0;

        // We don't know variant count here; try indices 0..32 as a safe upper bound for now.
        // Frontend should ensure realistic variant counts.
        while (index < 32) {
            if (df::exists_<VarKey>(&poll.id, VarKey { i: index })) {
                let vv = df::borrow<VarKey, VariantVotes>(&poll.id, VarKey { i: index });
                if (vv.count > best_count) { best_count = vv.count; best_idx = index; };
            };
            index = index + 1;
        };

        let poll_address = object::uid_to_address(&poll.id);
        event::emit(PollClosed { poll_address, content_id: poll.content_id, winning_variant: best_idx, total_votes: best_count });
    }

    /// View helper: get current vote count for a variant via dev-inspect
    public fun get_variant_count(poll: &Poll, variant_index: u64): u64 {
        if (!df::exists_<VarKey>(&poll.id, VarKey { i: variant_index })) return 0;
        let vv = df::borrow<VarKey, VariantVotes>(&poll.id, VarKey { i: variant_index });
        vv.count
    }
}
