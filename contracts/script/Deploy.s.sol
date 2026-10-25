// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RelayEscrow} from "../src/RelayEscrow.sol";
import {MockWIF} from "../src/MockWIF.sol";

/// Testnet (46630): deploys MockWIF + RelayEscrow.
///   forge script script/Deploy.s.sol --rpc-url rh_testnet --account deployer --broadcast
/// Mainnet (4663): uses the real $WIF; refuses to deploy a mock.
///   forge script script/Deploy.s.sol --rpc-url rh_mainnet --account deployer --broadcast
contract Deploy is Script {
    address constant WIF_MAINNET = 0x5173b8eA6923c2d40267890D45C46a3480954773;

    function run() external {
        vm.startBroadcast();
        address token;
        if (block.chainid == 4663) {
            token = WIF_MAINNET;
        } else {
            require(block.chainid != 1, "wrong chain");
            token = address(new MockWIF());
            console2.log("MockWIF (TESTNET ONLY):", token);
        }
        RelayEscrow escrow = new RelayEscrow(IERC20(token));
        vm.stopBroadcast();
        console2.log("chainId:", block.chainid);
        console2.log("token:", token);
        console2.log("RelayEscrow:", address(escrow));
    }
}
