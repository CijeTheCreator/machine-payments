// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IHederaTokenService } from "../interfaces/IHederaTokenService.sol";

/// @title MockHederaTokenService
/// @notice Mock implementation of the Hedera Token Service system precompile (address 0x167)
/// used for 100% offline Hardhat unit tests (Mechanical Gate 11).
contract MockHederaTokenService {
    int64 public customResponseCode;

    event CryptoTransferCalled(address indexed caller, IHederaTokenService.AccountAmount[] transfers);

    function setResponseCode(int64 _code) external {
        customResponseCode = _code;
    }

    function cryptoTransfer(
        IHederaTokenService.TransferList memory transferList,
        IHederaTokenService.TokenTransferList[] memory /* tokenTransfers */
    ) external returns (int64) {
        emit CryptoTransferCalled(msg.sender, transferList.transfers);
        if (customResponseCode != 0) {
            return customResponseCode;
        }
        return 22; // HTS_SUCCESS
    }
}
