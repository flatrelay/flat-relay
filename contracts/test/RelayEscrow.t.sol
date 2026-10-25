// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RelayEscrow} from "../src/RelayEscrow.sol";
import {MockWIF} from "../src/MockWIF.sol";

contract RelayEscrowTest is Test {
    RelayEscrow escrow;
    MockWIF wif;

    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address relayer = makeAddr("relayer");
    uint256 signerPk = 0xA11CE;
    address signer;

    uint128 constant PER = 250 ether;
    uint32 constant MAX = 4;

    function setUp() public {
        wif = new MockWIF();
        escrow = new RelayEscrow(wif);
        signer = vm.addr(signerPk);
        wif.transfer(creator, 1_000_000 ether);
    }

    // ---------------------------------------------------------------- helpers

    function _create(uint128 per, uint32 max, uint64 duration) internal returns (uint256 id) {
        (uint256 pool, uint256 burn) = escrow.fundingRequired(per, max);
        vm.startPrank(creator);
        wif.approve(address(escrow), pool + burn);
        id = escrow.createCampaign(per, max, uint64(block.timestamp) + duration, signer, keccak256("meta"));
        vm.stopPrank();
    }

    function _sig(uint256 pk, uint256 id, address to, uint256 deadline) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, escrow.hashTicket(id, to, deadline));
        return abi.encodePacked(r, s, v);
    }

    // ----------------------------------------------------------------- create

    function test_create_pullsPoolAndBurnsOnePercent() public {
        uint256 supplyBefore = wif.totalSupply();
        uint256 creatorBefore = wif.balanceOf(creator);
        uint256 id = _create(PER, MAX, 7 days);

        uint256 pool = uint256(PER) * MAX; // 1000
        assertEq(id, 1);
        assertEq(wif.balanceOf(address(escrow)), pool);
        assertEq(creatorBefore - wif.balanceOf(creator), pool + pool / 100);
        assertEq(supplyBefore - wif.totalSupply(), pool / 100); // 10 WIF burned
        RelayEscrow.Campaign memory c = escrow.getCampaign(id);
        assertEq(c.creator, creator);
        assertEq(c.claimSigner, signer);
        assertEq(c.remaining, pool);
    }

    function test_create_revertsOnBadConfig() public {
        vm.startPrank(creator);
        wif.approve(address(escrow), type(uint256).max);
        uint64 ok = uint64(block.timestamp + 1 days);
        vm.expectRevert(RelayEscrow.ZeroAddress.selector);
        escrow.createCampaign(PER, MAX, ok, address(0), 0);
        vm.expectRevert(RelayEscrow.InvalidAmount.selector);
        escrow.createCampaign(0, MAX, ok, signer, 0);
        vm.expectRevert(RelayEscrow.InvalidClaims.selector);
        escrow.createCampaign(PER, 0, ok, signer, 0);
        vm.expectRevert(RelayEscrow.InvalidClaims.selector);
        escrow.createCampaign(PER, 10_001, ok, signer, 0);
        vm.expectRevert(RelayEscrow.InvalidExpiry.selector);
        escrow.createCampaign(PER, MAX, uint64(block.timestamp), signer, 0);
        vm.expectRevert(RelayEscrow.InvalidExpiry.selector);
        escrow.createCampaign(PER, MAX, uint64(block.timestamp + 31 days), signer, 0);
        vm.expectRevert(RelayEscrow.PoolTooSmall.selector);
        escrow.createCampaign(1, 99, ok, signer, 0); // pool 99 wei -> burn rounds to 0
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ claim

    function test_claim_paysNamedRecipient_viaRelayer() public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(signerPk, id, alice, deadline);

        vm.prank(relayer); // anyone can submit; funds still go to alice
        escrow.claim(id, alice, deadline, sig);

        assertEq(wif.balanceOf(alice), PER);
        assertEq(wif.balanceOf(relayer), 0);
        assertTrue(escrow.claimed(id, alice));
        assertEq(escrow.getCampaign(id).claimCount, 1);
    }

    function test_claim_ticketCannotBeRedirected() public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sigForAlice = _sig(signerPk, id, alice, deadline);
        vm.expectRevert(RelayEscrow.InvalidSigner.selector);
        escrow.claim(id, bob, deadline, sigForAlice);
    }

    function test_claim_replayReverts() public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(signerPk, id, alice, deadline);
        escrow.claim(id, alice, deadline, sig);
        vm.expectRevert(RelayEscrow.AlreadyClaimed.selector);
        escrow.claim(id, alice, deadline, sig);
        // a fresh ticket for the same recipient is also rejected
        bytes memory sig2 = _sig(signerPk, id, alice, deadline + 1);
        vm.expectRevert(RelayEscrow.AlreadyClaimed.selector);
        escrow.claim(id, alice, deadline + 1, sig2);
    }

    function test_claim_wrongSignerReverts() public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory badSig = _sig(0xB0B, id, alice, deadline); // sign before expectRevert
        vm.expectRevert(RelayEscrow.InvalidSigner.selector);
        escrow.claim(id, alice, deadline, badSig);
    }

    function test_claim_ticketForOtherCampaignReverts() public {
        uint256 id1 = _create(PER, MAX, 7 days);
        uint256 id2 = _create(PER, MAX, 7 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sigForId1 = _sig(signerPk, id1, alice, deadline); // sign before expectRevert
        vm.expectRevert(RelayEscrow.InvalidSigner.selector);
        escrow.claim(id2, alice, deadline, sigForId1);
    }

    function test_claim_ticketForOtherContractReverts() public {
        RelayEscrow other = new RelayEscrow(wif);
        uint256 id = _create(PER, MAX, 7 days);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, other.hashTicket(id, alice, deadline));
        vm.expectRevert(RelayEscrow.InvalidSigner.selector);
        escrow.claim(id, alice, deadline, abi.encodePacked(r, s, v));
    }

    function test_claim_ticketForOtherChainReverts() public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(signerPk, id, alice, deadline); // signed on chain 31337
        vm.chainId(4663);
        vm.expectRevert(RelayEscrow.InvalidSigner.selector);
        escrow.claim(id, alice, deadline, sig);
    }

    function test_claim_expiredTicketReverts() public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sig(signerPk, id, alice, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(RelayEscrow.TicketExpired.selector);
        escrow.claim(id, alice, deadline, sig);
    }

    function test_claim_atExpiryReverts() public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 expiry = escrow.getCampaign(id).expiry;
        bytes memory sig = _sig(signerPk, id, alice, expiry + 1 days);
        vm.warp(expiry);
        vm.expectRevert(RelayEscrow.CampaignExpired.selector);
        escrow.claim(id, alice, expiry + 1 days, sig);
    }

    function test_claim_exhaustionReverts() public {
        uint256 id = _create(PER, 2, 7 days);
        uint256 d = block.timestamp + 1 hours;
        escrow.claim(id, alice, d, _sig(signerPk, id, alice, d));
        escrow.claim(id, bob, d, _sig(signerPk, id, bob, d));
        address carol = makeAddr("carol");
        bytes memory sig = _sig(signerPk, id, carol, d);
        vm.expectRevert(RelayEscrow.CampaignExhausted.selector);
        escrow.claim(id, carol, d, sig);
        assertEq(wif.balanceOf(address(escrow)), 0);
    }

    function test_claim_unknownCampaignReverts() public {
        vm.expectRevert(RelayEscrow.UnknownCampaign.selector);
        escrow.claim(42, alice, block.timestamp, "");
    }

    // ----------------------------------------------------------------- refund

    function test_refund_afterExpiry_returnsUnclaimed() public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 d = block.timestamp + 1 hours;
        escrow.claim(id, alice, d, _sig(signerPk, id, alice, d));
        uint256 before = wif.balanceOf(creator);
        vm.warp(escrow.getCampaign(id).expiry);
        vm.prank(creator);
        escrow.refund(id);
        assertEq(wif.balanceOf(creator) - before, uint256(PER) * (MAX - 1));
        assertEq(escrow.getCampaign(id).remaining, 0);
        vm.prank(creator);
        vm.expectRevert(RelayEscrow.NothingToRefund.selector);
        escrow.refund(id);
    }

    function test_refund_beforeExpiryReverts() public {
        uint256 id = _create(PER, MAX, 7 days);
        vm.warp(escrow.getCampaign(id).expiry - 1);
        vm.prank(creator);
        vm.expectRevert(RelayEscrow.CampaignNotExpired.selector);
        escrow.refund(id);
    }

    function test_refund_nonCreatorReverts() public {
        uint256 id = _create(PER, MAX, 7 days);
        vm.warp(escrow.getCampaign(id).expiry);
        vm.prank(alice);
        vm.expectRevert(RelayEscrow.NotCreator.selector);
        escrow.refund(id);
    }

    // ------------------------------------------------------------------- fuzz

    function testFuzz_accountingConserved(uint128 per, uint8 maxRaw, uint8 claimsRaw) public {
        uint32 max = uint32(bound(maxRaw, 1, 50));
        per = uint128(bound(per, 100, 10_000 ether));
        uint256 claims = bound(claimsRaw, 0, max);
        uint256 supplyBefore = wif.totalSupply();

        uint256 id = _create(per, max, 7 days);
        (uint256 pool, uint256 burn) = escrow.fundingRequired(per, max);
        assertEq(supplyBefore - wif.totalSupply(), burn);

        uint256 d = block.timestamp + 1 hours;
        for (uint256 i = 0; i < claims; i++) {
            address to = address(uint160(0x1000 + i));
            escrow.claim(id, to, d, _sig(signerPk, id, to, d));
            assertEq(wif.balanceOf(to), per);
        }
        assertEq(wif.balanceOf(address(escrow)), pool - claims * per);

        vm.warp(escrow.getCampaign(id).expiry);
        if (claims < max) {
            vm.prank(creator);
            escrow.refund(id);
        }
        assertEq(wif.balanceOf(address(escrow)), 0);
    }

    function testFuzz_expiryBoundary(uint32 offset) public {
        uint256 id = _create(PER, MAX, 7 days);
        uint256 expiry = escrow.getCampaign(id).expiry;
        uint256 t = bound(offset, block.timestamp, expiry + 1 days);
        bytes memory sig = _sig(signerPk, id, alice, type(uint256).max);
        vm.warp(t);
        if (t < expiry) {
            escrow.claim(id, alice, type(uint256).max, sig);
            assertEq(wif.balanceOf(alice), PER);
        } else {
            vm.expectRevert(RelayEscrow.CampaignExpired.selector);
            escrow.claim(id, alice, type(uint256).max, sig);
        }
    }
}
