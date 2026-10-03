import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { Vault, MockHederaTokenService } from "../typechain-types";

describe("Vault (Curb On-Chain Spend Guardrails)", function () {
  const HTS_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000167";
  const TINYBAR_PER_HBAR = 100_000_000n;

  const PER_TASK_CAP = 3n * TINYBAR_PER_HBAR; // 3 HBAR
  const PER_DAY_CAP = 5n * TINYBAR_PER_HBAR; // 5 HBAR

  async function deployFixture() {
    const [owner, agent, merchant, attacker] = await ethers.getSigners();

    // 1. Deploy MockHederaTokenService and inject its bytecode at 0x167 for 100% offline testing
    const MockHTSFactory = await ethers.getContractFactory("MockHederaTokenService");
    const mockHTSDeployment = await MockHTSFactory.deploy();
    await mockHTSDeployment.waitForDeployment();

    const mockBytecode = await ethers.provider.getCode(await mockHTSDeployment.getAddress());
    await ethers.provider.send("hardhat_setCode", [HTS_PRECOMPILE_ADDRESS, mockBytecode]);

    const mockHTS = MockHTSFactory.attach(HTS_PRECOMPILE_ADDRESS) as MockHederaTokenService;

    // 2. Deploy Vault
    const VaultFactory = await ethers.getContractFactory("Vault");
    const vault = (await VaultFactory.deploy(agent.address, PER_TASK_CAP, PER_DAY_CAP)) as Vault;
    await vault.waitForDeployment();

    // 3. Fund Vault with 10 HBAR
    await owner.sendTransaction({
      to: await vault.getAddress(),
      value: 10n * TINYBAR_PER_HBAR,
    });

    return { vault, mockHTS, owner, agent, merchant, attacker };
  }

  describe("Deployment & Configuration", function () {
    it("initializes owner, agent, caps, and dayStart correctly", async function () {
      const { vault, owner, agent } = await deployFixture();

      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.agent()).to.equal(agent.address);
      expect(await vault.perTaskCap()).to.equal(PER_TASK_CAP);
      expect(await vault.perDayCap()).to.equal(PER_DAY_CAP);
      expect(await vault.daySpent()).to.equal(0n);

      const [pOwner, pAgent, pTaskCap, pDayCap, pDaySpent] = await vault.policy();
      expect(pOwner).to.equal(owner.address);
      expect(pAgent).to.equal(agent.address);
      expect(pTaskCap).to.equal(PER_TASK_CAP);
      expect(pDayCap).to.equal(PER_DAY_CAP);
      expect(pDaySpent).to.equal(0n);
    });

    it("allows owner to update policy caps", async function () {
      const { vault, owner } = await deployFixture();
      const newPerTask = 10n * TINYBAR_PER_HBAR;
      const newPerDay = 50n * TINYBAR_PER_HBAR;

      await expect(vault.connect(owner).setPolicy(newPerTask, newPerDay))
        .to.emit(vault, "PolicySet")
        .withArgs(newPerTask, newPerDay);

      expect(await vault.perTaskCap()).to.equal(newPerTask);
      expect(await vault.perDayCap()).to.equal(newPerDay);
    });

    it("reverts setPolicy when called by non-owner", async function () {
      const { vault, agent } = await deployFixture();
      await expect(vault.connect(agent).setPolicy(100n, 200n)).to.be.revertedWithCustomError(vault, "NotOwner");
    });
  });

  describe("Allowlist Enforcement", function () {
    it("allows owner to grant and revoke recipient permission", async function () {
      const { vault, owner, merchant } = await deployFixture();

      expect(await vault.allowed(merchant.address)).to.equal(false);

      await expect(vault.connect(owner).setAllowed(merchant.address, true))
        .to.emit(vault, "AllowSet")
        .withArgs(merchant.address, true);

      expect(await vault.allowed(merchant.address)).to.equal(true);

      await expect(vault.connect(owner).setAllowed(merchant.address, false))
        .to.emit(vault, "AllowSet")
        .withArgs(merchant.address, false);

      expect(await vault.allowed(merchant.address)).to.equal(false);
    });

    it("reverts pay() if recipient is not allowlisted", async function () {
      const { vault, agent, merchant } = await deployFixture();
      const amount = 1n * TINYBAR_PER_HBAR;

      await expect(vault.connect(agent).pay(merchant.address, amount))
        .to.be.revertedWithCustomError(vault, "NotAllowed")
        .withArgs(merchant.address);
    });

    it("reverts setAllowed when called by non-owner", async function () {
      const { vault, agent, merchant } = await deployFixture();
      await expect(vault.connect(agent).setAllowed(merchant.address, true)).to.be.revertedWithCustomError(
        vault,
        "NotOwner",
      );
    });
  });

  describe("Spend Limits (Per-Task & Rolling 24-Hour Cap)", function () {
    beforeEach(async function () {
      // Allowlist merchant
    });

    it("executes payment when within all caps and allowlisted", async function () {
      const { vault, owner, agent, merchant } = await deployFixture();
      await vault.connect(owner).setAllowed(merchant.address, true);

      const payAmount = 2n * TINYBAR_PER_HBAR; // 2 HBAR (<= 3 HBAR task cap, <= 5 HBAR day cap)

      await expect(vault.connect(agent).pay(merchant.address, payAmount))
        .to.emit(vault, "Paid")
        .withArgs(merchant.address, payAmount, payAmount);

      expect(await vault.daySpent()).to.equal(payAmount);
    });

    it("reverts payment exceeding perTaskCap", async function () {
      const { vault, owner, agent, merchant } = await deployFixture();
      await vault.connect(owner).setAllowed(merchant.address, true);

      const overAmount = 4n * TINYBAR_PER_HBAR; // 4 HBAR > 3 HBAR perTaskCap

      await expect(vault.connect(agent).pay(merchant.address, overAmount))
        .to.be.revertedWithCustomError(vault, "OverPerTask")
        .withArgs(overAmount, PER_TASK_CAP);
    });

    it("reverts cumulative payments exceeding perDayCap in same 24h window", async function () {
      const { vault, owner, agent, merchant } = await deployFixture();
      await vault.connect(owner).setAllowed(merchant.address, true);

      // Payment 1: 3 HBAR (succeeds)
      await vault.connect(agent).pay(merchant.address, 3n * TINYBAR_PER_HBAR);
      expect(await vault.daySpent()).to.equal(3n * TINYBAR_PER_HBAR);

      // Payment 2: 3 HBAR (would make 6 HBAR > 5 HBAR perDayCap -> reverts)
      const secondPay = 3n * TINYBAR_PER_HBAR;
      const would = 6n * TINYBAR_PER_HBAR;

      await expect(vault.connect(agent).pay(merchant.address, secondPay))
        .to.be.revertedWithCustomError(vault, "OverPerDay")
        .withArgs(would, PER_DAY_CAP);

      // But a payment of 2 HBAR brings total to 5 HBAR == perDayCap (succeeds)
      await expect(vault.connect(agent).pay(merchant.address, 2n * TINYBAR_PER_HBAR))
        .to.emit(vault, "Paid")
        .withArgs(merchant.address, 2n * TINYBAR_PER_HBAR, 5n * TINYBAR_PER_HBAR);

      expect(await vault.daySpent()).to.equal(5n * TINYBAR_PER_HBAR);
    });

    it("resets daily spend tracker after 24 hours have elapsed", async function () {
      const { vault, owner, agent, merchant } = await deployFixture();
      await vault.connect(owner).setAllowed(merchant.address, true);

      // Spend 3 HBAR on day 1
      await vault.connect(agent).pay(merchant.address, 3n * TINYBAR_PER_HBAR);
      expect(await vault.daySpent()).to.equal(3n * TINYBAR_PER_HBAR);

      // Fast-forward time by 24 hours + 1 second
      await time.increase(24 * 60 * 60 + 1);

      // In the new window, another 3 HBAR payment succeeds and resets daySpent
      await expect(vault.connect(agent).pay(merchant.address, 3n * TINYBAR_PER_HBAR))
        .to.emit(vault, "Paid")
        .withArgs(merchant.address, 3n * TINYBAR_PER_HBAR, 3n * TINYBAR_PER_HBAR);

      expect(await vault.daySpent()).to.equal(3n * TINYBAR_PER_HBAR);
    });

    it("reverts pay() when called by unauthorized account (non-agent)", async function () {
      const { vault, owner, merchant, attacker } = await deployFixture();
      await vault.connect(owner).setAllowed(merchant.address, true);

      await expect(vault.connect(attacker).pay(merchant.address, 1n * TINYBAR_PER_HBAR)).to.be.revertedWithCustomError(
        vault,
        "NotAgent",
      );
    });
  });

  describe("Agent Kill-Switch & Revocation", function () {
    it("locks out agent immediately when setAgent(address(0)) is called", async function () {
      const { vault, owner, agent, merchant } = await deployFixture();
      await vault.connect(owner).setAllowed(merchant.address, true);

      // Verify agent can pay initially
      await vault.connect(agent).pay(merchant.address, 1n * TINYBAR_PER_HBAR);

      // Owner activates kill-switch
      await expect(vault.connect(owner).setAgent(ethers.ZeroAddress))
        .to.emit(vault, "AgentSet")
        .withArgs(ethers.ZeroAddress);

      expect(await vault.agent()).to.equal(ethers.ZeroAddress);

      // Agent is immediately locked out
      await expect(vault.connect(agent).pay(merchant.address, 1n * TINYBAR_PER_HBAR)).to.be.revertedWithCustomError(
        vault,
        "NotAgent",
      );
    });

    it("allows appointing a new agent", async function () {
      const { vault, owner, agent, attacker: newAgent, merchant } = await deployFixture();
      await vault.connect(owner).setAllowed(merchant.address, true);

      await vault.connect(owner).setAgent(newAgent.address);
      expect(await vault.agent()).to.equal(newAgent.address);

      // Old agent fails
      await expect(vault.connect(agent).pay(merchant.address, 1n * TINYBAR_PER_HBAR)).to.be.revertedWithCustomError(
        vault,
        "NotAgent",
      );

      // New agent succeeds
      await expect(vault.connect(newAgent).pay(merchant.address, 1n * TINYBAR_PER_HBAR)).to.emit(vault, "Paid");
    });
  });

  describe("Withdrawal & Precompile Failure Handling", function () {
    it("allows owner to withdraw funds", async function () {
      const { vault, owner } = await deployFixture();
      const withdrawAmount = 2n * TINYBAR_PER_HBAR;

      await expect(vault.connect(owner).withdraw(withdrawAmount))
        .to.emit(vault, "Withdrawn")
        .withArgs(owner.address, withdrawAmount);
    });

    it("reverts withdraw() when called by agent or non-owner", async function () {
      const { vault, agent } = await deployFixture();
      await expect(vault.connect(agent).withdraw(1n * TINYBAR_PER_HBAR)).to.be.revertedWithCustomError(
        vault,
        "NotOwner",
      );
    });

    it("reverts with TransferFailed if precompile returns failure code", async function () {
      const { vault, mockHTS, owner, agent, merchant } = await deployFixture();
      await vault.connect(owner).setAllowed(merchant.address, true);

      // Force mock precompile to return error code 37 (INSUFFICIENT_PAYER_BALANCE)
      await mockHTS.setResponseCode(37);

      await expect(vault.connect(agent).pay(merchant.address, 1n * TINYBAR_PER_HBAR))
        .to.be.revertedWithCustomError(vault, "TransferFailed")
        .withArgs(37);
    });
  });
});
