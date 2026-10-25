// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @notice TESTNET ONLY. Stand-in for $WIF (18 decimals, burnable) so integration tests
///         never need real tokens. Never deploy to mainnet; never present as real $WIF.
contract MockWIF is ERC20, ERC20Burnable {
    constructor() ERC20("Mock World is Flat (TESTNET)", "mWIF") {
        _mint(msg.sender, 1_000_000_000 ether);
    }

    /// @notice Open faucet for testnet convenience.
    function faucet(address to, uint256 amount) external {
        require(amount <= 1_000_000 ether, "MockWIF: max 1M per call");
        _mint(to, amount);
    }
}
