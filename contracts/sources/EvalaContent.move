module evala::EvalaContent {
    use sui::event;
    use evala::EvalaVote; // for VoteBook and indexing

    /// Transferable ContentSet object representing one content voting session (v1)
    /// Note: `ipfs_hash` is a legacy name. It now carries a generic storage payload
    /// (UTF-8 bytes). In the current frontend, we store a JSON string of Walrus
    /// blob IDs, e.g. `{ "cids": ["<blobId1>", "<blobId2>", ...] }`.
    public struct ContentSet has key, store {
        id: object::UID,
        title: vector<u8>,
        /// Generic storage payload (was IPFS hash). Currently Walrus blob IDs JSON.
        ipfs_hash: vector<u8>,
        variants: u64,
        creator: address,
        created_epoch: u64,
        closed: bool,
    }

    /// Emitted when a content set is registered (v1)
    /// `ipfs_hash` carries the same generic storage payload as in the object.
    public struct ContentRegistered has copy, drop {
        content_id: object::ID,
        creator: address,
        variants: u64,
        ipfs_hash: vector<u8>,
    }

    /// Backward-compatible registration (v1)
    public fun register_content(
        title: vector<u8>,
        ipfs_hash: vector<u8>,
        variants: u64,
        ctx: &mut tx_context::TxContext
    ) {
        assert!(variants > 0, 0);
        let creator = tx_context::sender(ctx);
        let content = ContentSet {
            id: object::new(ctx),
            title,
            ipfs_hash: ipfs_hash,
            variants,
            creator,
            created_epoch: tx_context::epoch(ctx),
            closed: false,
        };
        let content_id = object::uid_to_inner(&content.id);
        event::emit(ContentRegistered { content_id, creator, variants, ipfs_hash });
        transfer::public_transfer(content, creator);
    }

    /// New version with description field preserved on-chain (v2)
    /// `ipfs_hash` is a legacy field name retained for compatibility; it stores a generic
    /// storage payload (currently Walrus blob IDs JSON) as UTF-8 bytes.
    public struct ContentSetV2 has key, store {
        id: object::UID,
        title: vector<u8>,
        description: vector<u8>,
        /// Generic storage payload (was IPFS hash). Currently Walrus blob IDs JSON.
        ipfs_hash: vector<u8>,
        variants: u64,
        creator: address,
        created_epoch: u64,
        closed: bool,
    }

    public struct ContentRegisteredV2 has copy, drop {
        content_id: object::ID,
        creator: address,
        title: vector<u8>,
        description: vector<u8>,
        variants: u64,
        /// Generic storage payload (was IPFS hash). Currently Walrus blob IDs JSON with file metadata.
        ipfs_hash: vector<u8>,
        /// Optional: File types as comma-separated string (e.g., "image,video,pdf")
        file_types: vector<u8>,
    }

    /// Register a new content set (v2) with title and description
    public fun register_content_v2(
        title: vector<u8>,
        description: vector<u8>,
        ipfs_hash: vector<u8>,
        variants: u64,
        file_types: vector<u8>,
        ctx: &mut tx_context::TxContext
    ) {
        // Input validation
        assert!(variants > 0, 0); // Error 0: variants must be > 0
        assert!(variants <= 10, 2); // Error 2: max 10 variants to prevent abuse
        assert!(title.length() > 0 && title.length() <= 200, 3); // Error 3: title length 1-200 bytes
        assert!(description.length() <= 1000, 4); // Error 4: description max 1000 bytes
        assert!(ipfs_hash.length() <= 200, 5); // Error 5: IPFS hash max 200 bytes (can be empty for client-side storage)
        let creator = tx_context::sender(ctx);
        let content = ContentSetV2 {
            id: object::new(ctx),
            title,
            description,
            ipfs_hash: ipfs_hash,
            variants,
            creator,
            created_epoch: tx_context::epoch(ctx),
            closed: false,
        };
        let content_id = object::uid_to_inner(&content.id);
        event::emit(ContentRegisteredV2 { content_id, creator, title: content.title, description: content.description, variants, ipfs_hash, file_types });
        transfer::public_transfer(content, creator);
    }

    /// Register content (v2) and index creator in VoteBook so creator cannot vote
    public fun register_content_v2_indexed(
        title: vector<u8>,
        description: vector<u8>,
        ipfs_hash: vector<u8>,
        variants: u64,
        file_types: vector<u8>,
        vb: &mut EvalaVote::VoteBook,
        ctx: &mut tx_context::TxContext
    ) {
        // Input validation
        assert!(variants > 0, 0); // Error 0: variants must be > 0
        assert!(variants <= 10, 2); // Error 2: max 10 variants to prevent abuse
        assert!(title.length() > 0 && title.length() <= 200, 3); // Error 3: title length 1-200 bytes
        assert!(description.length() <= 1000, 4); // Error 4: description max 1000 bytes
        assert!(ipfs_hash.length() <= 200, 5); // Error 5: IPFS hash max 200 bytes (can be empty for client-side storage)
        let creator = tx_context::sender(ctx);
        let content = ContentSetV2 {
            id: object::new(ctx),
            title,
            description,
            ipfs_hash: ipfs_hash,
            variants,
            creator,
            created_epoch: tx_context::epoch(ctx),
            closed: false,
        };
        let content_id = object::uid_to_inner(&content.id);
        event::emit(ContentRegisteredV2 { content_id, creator, title: content.title, description: content.description, variants, ipfs_hash, file_types });
        // Index creator for this content to prevent self-voting (keyed by object::ID)
        EvalaVote::index_creator(vb, content_id, creator);
        transfer::public_transfer(content, creator);
    }

    /// Mark a content set as closed; only creator may close (works for both versions when borrowed mutably)
    public fun close(content: &mut ContentSet, ctx: &tx_context::TxContext) {
        let sender = tx_context::sender(ctx);
        assert!(content.creator == sender, 1);
        content.closed = true;
    }

    /// Close for v2
    public fun close_v2(content: &mut ContentSetV2, ctx: &tx_context::TxContext) {
        let sender = tx_context::sender(ctx);
        assert!(content.creator == sender, 1);
        content.closed = true;
    }
}
