import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const deployVault: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Agent address defaults to AGENT_ADDRESS env var or deployer
  const agentAddress = process.env.AGENT_ADDRESS || process.env.NEXT_PUBLIC_AGENT_ADDRESS || deployer;

  // 1 HBAR = 10^8 tinybar
  const TINYBAR_PER_HBAR = 100_000_000n;
  const perTaskCapHbar = process.env.VAULT_PER_TASK_CAP_HBAR ? BigInt(process.env.VAULT_PER_TASK_CAP_HBAR) : 5n;
  const perDayCapHbar = process.env.VAULT_PER_DAY_CAP_HBAR ? BigInt(process.env.VAULT_PER_DAY_CAP_HBAR) : 20n;

  const perTaskCap = perTaskCapHbar * TINYBAR_PER_HBAR;
  const perDayCap = perDayCapHbar * TINYBAR_PER_HBAR;

  console.log(
    `Deploying Vault with Agent: ${agentAddress}, perTaskCap: ${perTaskCap} tinybar (${perTaskCapHbar} HBAR), perDayCap: ${perDayCap} tinybar (${perDayCapHbar} HBAR)`,
  );

  await deploy("Vault", {
    from: deployer,
    args: [agentAddress, perTaskCap, perDayCap],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployVault.tags = ["Vault"];
export default deployVault;
