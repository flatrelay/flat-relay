// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RelayEscrow} from "../src/RelayEscrow.sol";

/// Gift-mode end-to-end: approve exact amount -> create campaign (1% burn) -> sign a ticket
/// with a throwaway gift key -> claim to a fresh recipient. Signs with your keystore account.
///
///   ESCROW=0x... forge script script/GiftE2E.s.sol --rpc-url rh_testnet --account deployer --broadcast
///   Mainnet: add CONFIRM_MAINNET=true; reward is capped at 100 $WIF.
contract GiftE2E is Script {
    uint256 constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    struct Plan {
        RelayEscrow escrow;
        IERC20 token;
        uint128 perClaim;
        uint256 total; // pool + burn
        uint256 campaignId;
        uint64 expiry;
        uint256 deadline;
        address giftSigner;
        address recipient;
        bytes signature;
    }

    function _key(bytes memory seed) internal pure returns (uint256) {
        return (uint256(keccak256(seed)) % (SECP256K1_N - 1)) + 1;
    }

    function _plan() internal view returns (Plan memory p) {
        p.escrow = RelayEscrow(vm.envAddress("ESCROW"));
        p.token = p.escrow.wif();
        p.perClaim = uint128(vm.envOr("PER_CLAIM_WEI", uint256(10 ether)));

        if (block.chainid == 4663) {
            require(vm.envOr("CONFIRM_MAINNET", false), "Set CONFIRM_MAINNET=true to spend real $WIF");
            require(p.perClaim <= 100 ether, "Mainnet test capped at 100 WIF");
        }

        (uint256 pool, uint256 burn) = p.escrow.fundingRequired(p.perClaim, 1);
        p.total = pool + burn;
        p.campaignId = p.escrow.campaignCount() + 1;
        p.expiry = uint64(block.timestamp + 1 days);
        p.deadline = block.timestamp + 1 hours;

        // Throwaway gift key (in the app it lives only in the link's #fragment) and a fresh recipient.
        uint256 giftPk = _key(abi.encode(block.timestamp, block.prevrandao, address(p.escrow), "gift"));
        p.giftSigner = vm.addr(giftPk);
        // On mainnet set RECIPIENT to an address you control: the fallback key is derivable from public data.
        p.recipient = vm.envOr("RECIPIENT", vm.addr(_key(abi.encode(giftPk, "recipient"))));
        if (block.chainid == 4663) require(vm.envExists("RECIPIENT"), "Set RECIPIENT on mainnet");
        p.signature = _sign(giftPk, p.escrow.hashTicket(p.campaignId, p.recipient, p.deadline));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function run() external {
        Plan memory p = _plan();
        console2.log("token:", address(p.token));
        console2.log("approve total (wei):", p.total);
        console2.log("gift signer:", p.giftSigner);
        console2.log("recipient:", p.recipient);

        // Measure the change, not the absolute balance: the recipient may already hold $WIF
        // (e.g. RECIPIENT = deployer, who also pays pool + burn).
        uint256 before = p.token.balanceOf(p.recipient);

        vm.startBroadcast();
        p.token.approve(address(p.escrow), p.total); // exact, never unlimited
        uint256 id = p.escrow.createCampaign(p.perClaim, 1, p.expiry, p.giftSigner, keccak256("gift-e2e"));
        require(id == p.campaignId, "campaign id moved; re-run");
        p.escrow.claim(id, p.recipient, p.deadline, p.signature);
        vm.stopBroadcast();

        uint256 afterBal = p.token.balanceOf(p.recipient);
        if (p.escrow.getCampaign(id).creator == p.recipient) {
            // sender paid pool + burn and received perClaim back: net change = -(total - perClaim)
            require(before - afterBal == p.total - p.perClaim, "recipient not paid");
        } else {
            require(afterBal - before == p.perClaim, "recipient not paid");
        }
        require(p.escrow.claimed(id, p.recipient), "claim not recorded");
        console2.log("PASS campaign id:", id);
    }
}
