import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const deployAgentRegistry: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Registration fee in tinybar / wei (defaults to 0 for frictionless testnet onboarding)
  const registrationFee = process.env.AGENT_REGISTRATION_FEE_TINYBAR
    ? BigInt(process.env.AGENT_REGISTRATION_FEE_TINYBAR)
    : 0n;

  console.log(`Deploying AgentRegistry with registration fee: ${registrationFee}`);

  await deploy("AgentRegistry", {
    from: deployer,
    args: [registrationFee],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployAgentRegistry.tags = ["AgentRegistry"];
export default deployAgentRegistry;
