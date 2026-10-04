// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentRegistry — ERC-8004 compatible on-chain Agent Identity Registry for Hedera
/// @notice Enables autonomous AI agents to register, manage, and verify decentralized identities (DIDs)
/// and machine-to-machine service endpoints on Hedera.
contract AgentRegistry {
    struct AgentInfo {
        string did;
        uint256 id;
        string description;
        string serviceEndpoint;
        address walletAddress;
        uint256 registeredAt;
        bool active;
    }

    uint256 private _nextAgentId = 1;
    address public owner;
    uint256 public registrationFee;

    mapping(address => AgentInfo) private _agentsByAddress;
    mapping(uint256 => address) private _addressByAgentId;
    mapping(string => address) private _addressByEndpoint;
    mapping(string => address) private _addressByDid;

    event AgentRegistered(address indexed agent, string did, uint256 indexed agentId, string serviceEndpoint);
    event ServiceEndpointUpdated(uint256 indexed agentId, string newEndpoint);
    event AgentDeactivated(address indexed agent, uint256 indexed agentId);
    event RegistrationFeeUpdated(uint256 newFee);

    error AddressAlreadyRegistered(address agent);
    error DIDAlreadyRegistered(string did);
    error ServiceEndpointAlreadyRegistered(string serviceEndpoint);
    error AgentNotFound(address agent);
    error AgentNotFoundForId(uint256 agentId);
    error AgentNotFoundForEndpoint(string serviceEndpoint);
    error InsufficientRegistrationFee(uint256 sent, uint256 required);
    error EmptyString();
    error NotOwner();
    error NotAgent();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 initialFee) {
        owner = msg.sender;
        registrationFee = initialFee;
    }

    /// @notice Register a new agent identity on the blockchain
    /// @param did The decentralized identifier (e.g. did:iden3:... or did:hedera:...)
    /// @param description Brief description or role of the agent
    /// @param serviceEndpoint Service URL where this agent receives machine requests
    function registerAgent(
        string calldata did,
        string calldata description,
        string calldata serviceEndpoint
    ) external payable returns (uint256 agentId) {
        if (msg.value < registrationFee) {
            revert InsufficientRegistrationFee(msg.value, registrationFee);
        }
        if (bytes(did).length == 0 || bytes(serviceEndpoint).length == 0) {
            revert EmptyString();
        }
        if (_agentsByAddress[msg.sender].active) {
            revert AddressAlreadyRegistered(msg.sender);
        }
        if (_addressByDid[did] != address(0)) {
            revert DIDAlreadyRegistered(did);
        }
        if (_addressByEndpoint[serviceEndpoint] != address(0)) {
            revert ServiceEndpointAlreadyRegistered(serviceEndpoint);
        }

        agentId = _nextAgentId++;

        AgentInfo memory newAgent = AgentInfo({
            did: did,
            id: agentId,
            description: description,
            serviceEndpoint: serviceEndpoint,
            walletAddress: msg.sender,
            registeredAt: block.timestamp,
            active: true
        });

        _agentsByAddress[msg.sender] = newAgent;
        _addressByAgentId[agentId] = msg.sender;
        _addressByEndpoint[serviceEndpoint] = msg.sender;
        _addressByDid[did] = msg.sender;

        emit AgentRegistered(msg.sender, did, agentId, serviceEndpoint);
    }

    /// @notice Update the HTTP service endpoint for the caller agent
    /// @param newEndpoint The updated endpoint URL
    function updateServiceEndpoint(string calldata newEndpoint) external {
        if (bytes(newEndpoint).length == 0) revert EmptyString();
        AgentInfo storage agent = _agentsByAddress[msg.sender];
        if (!agent.active) revert AgentNotFound(msg.sender);

        address existing = _addressByEndpoint[newEndpoint];
        if (existing != address(0) && existing != msg.sender) {
            revert ServiceEndpointAlreadyRegistered(newEndpoint);
        }

        delete _addressByEndpoint[agent.serviceEndpoint];
        agent.serviceEndpoint = newEndpoint;
        _addressByEndpoint[newEndpoint] = msg.sender;

        emit ServiceEndpointUpdated(agent.id, newEndpoint);
    }

    /// @notice Deactivate the caller agent's identity
    function deactivateAgent() external {
        AgentInfo storage agent = _agentsByAddress[msg.sender];
        if (!agent.active) revert AgentNotFound(msg.sender);

        agent.active = false;
        delete _addressByEndpoint[agent.serviceEndpoint];
        delete _addressByDid[agent.did];

        emit AgentDeactivated(msg.sender, agent.id);
    }

    /// @notice Query agent details by its wallet address (ERC-8004)
    function getAgentByAddress(
        address agent
    ) external view returns (string memory did, uint256 id, string memory description, string memory serviceEndpoint) {
        AgentInfo memory a = _agentsByAddress[agent];
        if (!a.active) revert AgentNotFound(agent);
        return (a.did, a.id, a.description, a.serviceEndpoint);
    }

    /// @notice Query agent details by its numeric agent ID
    function getAgentById(
        uint256 agentId
    ) external view returns (string memory did, uint256 id, string memory description, string memory serviceEndpoint) {
        address agentAddr = _addressByAgentId[agentId];
        if (agentAddr == address(0)) revert AgentNotFoundForId(agentId);
        AgentInfo memory a = _agentsByAddress[agentAddr];
        if (!a.active) revert AgentNotFoundForId(agentId);
        return (a.did, a.id, a.description, a.serviceEndpoint);
    }

    /// @notice Query agent details by its registered service endpoint
    function getAgentByServiceEndpoint(
        string calldata serviceEndpoint
    )
        external
        view
        returns (string memory did, uint256 id, string memory description, string memory serviceEndpointOut)
    {
        address agentAddr = _addressByEndpoint[serviceEndpoint];
        if (agentAddr == address(0)) revert AgentNotFoundForEndpoint(serviceEndpoint);
        AgentInfo memory a = _agentsByAddress[agentAddr];
        if (!a.active) revert AgentNotFoundForEndpoint(serviceEndpoint);
        return (a.did, a.id, a.description, a.serviceEndpoint);
    }

    /// @notice Check if an address corresponds to an active registered agent
    function isAgentRegistered(address agent) external view returns (bool) {
        return _agentsByAddress[agent].active;
    }

    /// @notice Get an agent's registered DID
    function getAgentDID(address agent) external view returns (string memory) {
        AgentInfo memory a = _agentsByAddress[agent];
        if (!a.active) revert AgentNotFound(agent);
        return a.did;
    }

    /// @notice Get an agent's registered service endpoint URL
    function getAgentServiceEndpoint(address agent) external view returns (string memory) {
        AgentInfo memory a = _agentsByAddress[agent];
        if (!a.active) revert AgentNotFound(agent);
        return a.serviceEndpoint;
    }

    /// @notice Update the registration fee (owner only)
    function setRegistrationFee(uint256 newFee) external onlyOwner {
        registrationFee = newFee;
        emit RegistrationFeeUpdated(newFee);
    }

    /// @notice Withdraw accumulated registration fees (owner only)
    function withdrawFees(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        (bool sent, ) = to.call{ value: balance }("");
        require(sent, "Withdrawal failed");
    }
}
