// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IHederaTokenService } from "./interfaces/IHederaTokenService.sol";

/// @title Vault — trustless on-chain spend-control for autonomous AI agents on Hedera.
/// @notice Inspired by Curb (CurbVault). The owner funds the vault and defines spending guardrails.
/// The agent can only move funds via `pay()`, which Hedera consensus enforces against:
/// 1. A per-task cap
/// 2. A rolling 24-hour cap
/// 3. A counterparty allowlist
/// Even a fully compromised agent cannot exceed limits or pay a non-allowlisted address.
/// The owner can revoke the agent instantly by setting the agent address to address(0).
/// @dev Disbursement uses the HTS `cryptoTransfer` precompile (address 0x167) rather than EVM `.call{value}`
/// because on Hedera contracts cannot reliably push HBAR to non-contract accounts via standard EVM `.call`.
contract Vault {
    IHederaTokenService private constant HTS = IHederaTokenService(address(0x167));
    int32 private constant HTS_SUCCESS = 22;

    address public owner;
    address public agent;
    uint256 public perTaskCap; // in tinybar (1 HBAR = 1e8 tinybar)
    uint256 public perDayCap; // in tinybar
    uint256 public daySpent;
    uint256 public dayStart;
    mapping(address => bool) public allowed;

    uint256 private _lock = 1;

    event Deposited(address indexed from, uint256 amount);
    event PolicySet(uint256 perTaskCap, uint256 perDayCap);
    event AllowSet(address indexed account, bool ok);
    event AgentSet(address indexed agent);
    event Paid(address indexed to, uint256 amount, uint256 daySpent);
    event Withdrawn(address indexed to, uint256 amount);

    error NotOwner();
    error NotAgent();
    error NotAllowed(address to);
    error OverPerTask(uint256 amount, uint256 cap);
    error OverPerDay(uint256 would, uint256 cap);
    error Reentrant();
    error TransferFailed(int32 code);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address _agent, uint256 _perTaskCap, uint256 _perDayCap) payable {
        owner = msg.sender;
        agent = _agent;
        perTaskCap = _perTaskCap;
        perDayCap = _perDayCap;
        dayStart = block.timestamp;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function setPolicy(uint256 _perTaskCap, uint256 _perDayCap) external onlyOwner {
        perTaskCap = _perTaskCap;
        perDayCap = _perDayCap;
        emit PolicySet(_perTaskCap, _perDayCap);
    }

    /// @notice Revoke the agent by passing address(0) — the instant kill switch.
    function setAgent(address _agent) external onlyOwner {
        agent = _agent;
        emit AgentSet(_agent);
    }

    function setAllowed(address account, bool ok) external onlyOwner {
        allowed[account] = ok;
        emit AllowSet(account, ok);
    }

    /// @notice The agent spends — fully enforced by Hedera consensus.
    function pay(address to, uint256 amount) external onlyAgent nonReentrant {
        if (!allowed[to]) revert NotAllowed(to);
        if (amount > perTaskCap) revert OverPerTask(amount, perTaskCap);

        if (block.timestamp >= dayStart + 1 days) {
            dayStart = block.timestamp;
            daySpent = 0;
        }
        uint256 would = daySpent + amount;
        if (would > perDayCap) revert OverPerDay(would, perDayCap);

        daySpent = would; // effects before interactions
        emit Paid(to, amount, daySpent);
        _transferHbar(to, int64(uint64(amount)));
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        _transferHbar(owner, int64(uint64(amount)));
        emit Withdrawn(owner, amount);
    }

    function policy() external view returns (address, address, uint256, uint256, uint256) {
        return (owner, agent, perTaskCap, perDayCap, daySpent);
    }

    /// @dev Native HBAR transfer (tinybar) from this contract to `to` via HTS precompile at 0x167.
    function _transferHbar(address to, int64 tinybar) private {
        IHederaTokenService.AccountAmount[] memory aa = new IHederaTokenService.AccountAmount[](2);
        aa[0] = IHederaTokenService.AccountAmount(address(this), -tinybar, false);
        aa[1] = IHederaTokenService.AccountAmount(to, tinybar, false);
        IHederaTokenService.TransferList memory tl = IHederaTokenService.TransferList(aa);
        IHederaTokenService.TokenTransferList[] memory none = new IHederaTokenService.TokenTransferList[](0);

        (bool ok, bytes memory res) = address(HTS).call(
            abi.encodeWithSelector(IHederaTokenService.cryptoTransfer.selector, tl, none)
        );
        int32 rc = ok && res.length >= 32 ? abi.decode(res, (int32)) : int32(-1);
        if (rc != HTS_SUCCESS) revert TransferFailed(rc);
    }
}
