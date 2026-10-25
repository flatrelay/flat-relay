// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20Burnable is IERC20 {
    function burn(uint256 value) external;
}

/// @title FLAT//RELAY escrow
/// @notice Creators fund $WIF campaigns; recipients claim with an EIP-712 ticket signed by the
///         campaign's `claimSigner` (a throwaway gift-link key, or the challenge verifier).
/// @dev    Immutable. No owner, no admin, no upgrade path. The only exit for funds is a
///         valid claim or the creator's refund after expiry. 1% of the reward pool is
///         burned on top of the pool at creation.
contract RelayEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Campaign {
        address creator; // 20 bytes
        uint64 expiry; // 8 bytes
        uint32 maxClaims; // 4 bytes  -> slot 0
        address claimSigner; // 20 bytes
        uint32 claimCount; // 4 bytes  -> slot 1
        uint128 perClaim; // 16 bytes
        uint128 remaining; // 16 bytes -> slot 2
        bytes32 metadataHash; //         -> slot 3
    }

    uint256 public constant BURN_BPS = 100; // 1% of the reward pool
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant MAX_CLAIMS = 10_000;
    bytes32 public constant TICKET_TYPEHASH =
        keccak256("Ticket(uint256 campaignId,address recipient,uint256 deadline)");

    IERC20 public immutable wif;
    uint256 public campaignCount;

    mapping(uint256 campaignId => Campaign) private _campaigns;
    mapping(uint256 campaignId => mapping(address recipient => bool)) public claimed;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address indexed claimSigner,
        uint256 perClaim,
        uint256 maxClaims,
        uint256 expiry,
        bytes32 metadataHash,
        uint256 burned
    );
    event Claimed(uint256 indexed campaignId, address indexed recipient, uint256 amount, address submitter);
    event Refunded(uint256 indexed campaignId, address indexed creator, uint256 amount);

    error ZeroAddress();
    error InvalidAmount();
    error InvalidClaims();
    error InvalidExpiry();
    error PoolTooSmall();
    error UnexpectedTransferAmount();
    error UnknownCampaign();
    error CampaignExpired();
    error CampaignNotExpired();
    error TicketExpired();
    error AlreadyClaimed();
    error CampaignExhausted();
    error InvalidSigner();
    error NotCreator();
    error NothingToRefund();

    constructor(IERC20 wif_) EIP712("FlatRelay", "1") {
        if (address(wif_) == address(0)) revert ZeroAddress();
        wif = wif_;
    }

    // ------------------------------------------------------------------ create

    /// @notice Total $WIF the creator must approve for a campaign: pool plus the 1% burn.
    function fundingRequired(uint256 perClaim, uint256 maxClaims) public pure returns (uint256 pool, uint256 burn) {
        pool = perClaim * maxClaims;
        burn = (pool * BURN_BPS) / 10_000;
    }

    function createCampaign(
        uint128 perClaim,
        uint32 maxClaims,
        uint64 expiry,
        address claimSigner,
        bytes32 metadataHash
    ) external nonReentrant returns (uint256 campaignId) {
        if (claimSigner == address(0)) revert ZeroAddress();
        if (perClaim == 0) revert InvalidAmount();
        if (maxClaims == 0 || maxClaims > MAX_CLAIMS) revert InvalidClaims();
        if (expiry <= block.timestamp || expiry > block.timestamp + MAX_DURATION) revert InvalidExpiry();

        (uint256 pool, uint256 burnAmount) = fundingRequired(perClaim, maxClaims);
        if (burnAmount == 0 || pool > type(uint128).max) revert PoolTooSmall();

        uint256 total = pool + burnAmount;
        uint256 before = wif.balanceOf(address(this));
        wif.safeTransferFrom(msg.sender, address(this), total);
        if (wif.balanceOf(address(this)) - before != total) revert UnexpectedTransferAmount();

        IERC20Burnable(address(wif)).burn(burnAmount);

        campaignId = ++campaignCount;
        _campaigns[campaignId] = Campaign({
            creator: msg.sender,
            expiry: expiry,
            maxClaims: maxClaims,
            claimSigner: claimSigner,
            claimCount: 0,
            perClaim: perClaim,
            remaining: uint128(pool),
            metadataHash: metadataHash
        });

        emit CampaignCreated(campaignId, msg.sender, claimSigner, perClaim, maxClaims, expiry, metadataHash, burnAmount);
    }

    // ------------------------------------------------------------------- claim

    /// @notice Anyone may submit; funds always go to the `recipient` named in the signed ticket.
    function claim(uint256 campaignId, address recipient, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
    {
        Campaign storage c = _campaigns[campaignId];
        if (c.creator == address(0)) revert UnknownCampaign();
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp >= c.expiry) revert CampaignExpired();
        if (block.timestamp > deadline) revert TicketExpired();
        if (claimed[campaignId][recipient]) revert AlreadyClaimed();
        if (c.claimCount >= c.maxClaims) revert CampaignExhausted();

        address signer = ECDSA.recover(hashTicket(campaignId, recipient, deadline), signature);
        if (signer != c.claimSigner) revert InvalidSigner();

        uint128 amount = c.perClaim;
        claimed[campaignId][recipient] = true;
        c.claimCount += 1;
        c.remaining -= amount;

        wif.safeTransfer(recipient, amount);
        emit Claimed(campaignId, recipient, amount, msg.sender);
    }

    // ------------------------------------------------------------------ refund

    function refund(uint256 campaignId) external nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        if (c.creator == address(0)) revert UnknownCampaign();
        if (msg.sender != c.creator) revert NotCreator();
        if (block.timestamp < c.expiry) revert CampaignNotExpired();
        uint256 amount = c.remaining;
        if (amount == 0) revert NothingToRefund();

        c.remaining = 0;
        wif.safeTransfer(c.creator, amount);
        emit Refunded(campaignId, c.creator, amount);
    }

    // ------------------------------------------------------------------- views

    function hashTicket(uint256 campaignId, address recipient, uint256 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(TICKET_TYPEHASH, campaignId, recipient, deadline)));
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _campaigns[campaignId];
    }
}
