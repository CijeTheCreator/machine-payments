import { expect } from "chai";
import { ethers } from "hardhat";
import type { AgentRegistry } from "../typechain-types";

describe("AgentRegistry (ERC-8004 Identity Registry)", function () {
  const REGISTRATION_FEE = ethers.parseEther("0.01");

  async function deployFixture() {
    const [owner, agent1, agent2, unauthorized] = await ethers.getSigners();

    const AgentRegistryFactory = await ethers.getContractFactory("AgentRegistry");
    const registry = (await AgentRegistryFactory.deploy(REGISTRATION_FEE)) as AgentRegistry;
    await registry.waitForDeployment();

    return { registry, owner, agent1, agent2, unauthorized };
  }

  describe("Registration & Lifecycle", function () {
    it("registers a new agent with valid DID, description, and endpoint", async function () {
      const { registry, agent1 } = await deployFixture();

      const did = "did:iden3:polygon:amoy:test123";
      const description = "Weather Oracle Agent";
      const endpoint = "https://weather.agent.io/api";

      await expect(
        registry.connect(agent1).registerAgent(did, description, endpoint, {
          value: REGISTRATION_FEE,
        }),
      )
        .to.emit(registry, "AgentRegistered")
        .withArgs(agent1.address, did, 1n, endpoint);

      expect(await registry.isAgentRegistered(agent1.address)).to.equal(true);

      const [retDid, retId, retDesc, retEndpoint] = await registry.getAgentByAddress(agent1.address);
      expect(retDid).to.equal(did);
      expect(retId).to.equal(1n);
      expect(retDesc).to.equal(description);
      expect(retEndpoint).to.equal(endpoint);
    });

    it("reverts registration when fee is insufficient", async function () {
      const { registry, agent1 } = await deployFixture();

      await expect(
        registry.connect(agent1).registerAgent("did:test", "Test Agent", "https://agent.io", {
          value: 0n,
        }),
      ).to.be.revertedWithCustomError(registry, "InsufficientRegistrationFee");
    });

    it("reverts duplicate address registration", async function () {
      const { registry, agent1 } = await deployFixture();

      await registry.connect(agent1).registerAgent("did:test:1", "Agent 1", "https://agent1.io", {
        value: REGISTRATION_FEE,
      });

      await expect(
        registry.connect(agent1).registerAgent("did:test:2", "Agent 1 Again", "https://agent2.io", {
          value: REGISTRATION_FEE,
        }),
      ).to.be.revertedWithCustomError(registry, "AddressAlreadyRegistered");
    });

    it("reverts duplicate DID or service endpoint from another agent", async function () {
      const { registry, agent1, agent2 } = await deployFixture();

      await registry.connect(agent1).registerAgent("did:test:shared", "Agent 1", "https://agent1.io", {
        value: REGISTRATION_FEE,
      });

      // Duplicate DID
      await expect(
        registry.connect(agent2).registerAgent("did:test:shared", "Agent 2", "https://agent2.io", {
          value: REGISTRATION_FEE,
        }),
      ).to.be.revertedWithCustomError(registry, "DIDAlreadyRegistered");

      // Duplicate endpoint
      await expect(
        registry.connect(agent2).registerAgent("did:test:unique", "Agent 2", "https://agent1.io", {
          value: REGISTRATION_FEE,
        }),
      ).to.be.revertedWithCustomError(registry, "ServiceEndpointAlreadyRegistered");
    });
  });

  describe("Queries & Lookups", function () {
    it("looks up agent by ID, address, and service endpoint", async function () {
      const { registry, agent1 } = await deployFixture();

      const did = "did:iden3:hedera:testnet:0.0.12345";
      const desc = "Settlement Agent";
      const endpoint = "https://settle.agent.hedera.com";

      await registry.connect(agent1).registerAgent(did, desc, endpoint, {
        value: REGISTRATION_FEE,
      });

      // By Address
      const byAddr = await registry.getAgentByAddress(agent1.address);
      expect(byAddr[0]).to.equal(did);

      // By ID
      const byId = await registry.getAgentById(1n);
      expect(byId[0]).to.equal(did);
      expect(byId[3]).to.equal(endpoint);

      // By Endpoint
      const byEp = await registry.getAgentByServiceEndpoint(endpoint);
      expect(byEp[0]).to.equal(did);
      expect(byEp[1]).to.equal(1n);

      // DID & Endpoint helpers
      expect(await registry.getAgentDID(agent1.address)).to.equal(did);
      expect(await registry.getAgentServiceEndpoint(agent1.address)).to.equal(endpoint);
    });

    it("reverts when querying non-existent agent", async function () {
      const { registry, unauthorized } = await deployFixture();

      await expect(registry.getAgentByAddress(unauthorized.address)).to.be.revertedWithCustomError(
        registry,
        "AgentNotFound",
      );

      await expect(registry.getAgentById(999n)).to.be.revertedWithCustomError(registry, "AgentNotFoundForId");

      await expect(registry.getAgentByServiceEndpoint("https://nonexistent.io")).to.be.revertedWithCustomError(
        registry,
        "AgentNotFoundForEndpoint",
      );
    });
  });

  describe("Updates & Deactivation", function () {
    it("allows registered agent to update their service endpoint", async function () {
      const { registry, agent1 } = await deployFixture();

      await registry.connect(agent1).registerAgent("did:test:1", "Agent 1", "https://old.endpoint.io", {
        value: REGISTRATION_FEE,
      });

      const newEp = "https://new.endpoint.io";
      await expect(registry.connect(agent1).updateServiceEndpoint(newEp))
        .to.emit(registry, "ServiceEndpointUpdated")
        .withArgs(1n, newEp);

      expect(await registry.getAgentServiceEndpoint(agent1.address)).to.equal(newEp);
    });

    it("allows agent to deactivate their identity", async function () {
      const { registry, agent1 } = await deployFixture();

      await registry.connect(agent1).registerAgent("did:test:1", "Agent 1", "https://endpoint.io", {
        value: REGISTRATION_FEE,
      });

      await expect(registry.connect(agent1).deactivateAgent())
        .to.emit(registry, "AgentDeactivated")
        .withArgs(agent1.address, 1n);

      expect(await registry.isAgentRegistered(agent1.address)).to.equal(false);
      await expect(registry.getAgentByAddress(agent1.address)).to.be.revertedWithCustomError(registry, "AgentNotFound");
    });
  });

  describe("Owner Administration", function () {
    it("allows owner to update registration fee", async function () {
      const { registry, owner } = await deployFixture();

      const newFee = ethers.parseEther("0.05");
      await expect(registry.connect(owner).setRegistrationFee(newFee))
        .to.emit(registry, "RegistrationFeeUpdated")
        .withArgs(newFee);

      expect(await registry.registrationFee()).to.equal(newFee);
    });

    it("allows owner to withdraw accumulated fees", async function () {
      const { registry, owner, agent1 } = await deployFixture();

      await registry.connect(agent1).registerAgent("did:test:1", "Agent 1", "https://endpoint.io", {
        value: REGISTRATION_FEE,
      });

      const beforeBalance = await ethers.provider.getBalance(owner.address);
      const tx = await registry.connect(owner).withdrawFees(owner.address);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const afterBalance = await ethers.provider.getBalance(owner.address);
      expect(afterBalance + gasUsed - beforeBalance).to.equal(REGISTRATION_FEE);
    });

    it("reverts administrative functions when called by non-owner", async function () {
      const { registry, agent1 } = await deployFixture();

      await expect(registry.connect(agent1).setRegistrationFee(0n)).to.be.revertedWithCustomError(registry, "NotOwner");

      await expect(registry.connect(agent1).withdrawFees(agent1.address)).to.be.revertedWithCustomError(
        registry,
        "NotOwner",
      );
    });
  });
});
