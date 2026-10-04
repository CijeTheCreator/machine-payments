"use client";

// @refresh reset
import { Contract } from "@scaffold-hbar-ui/debug-contracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-hbar";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar/useTargetNetwork";
import { ContractName } from "~~/utils/scaffold-hbar/contract";

type ContractUIProps = {
  contractName: ContractName;
  className?: string;
};

/**
 * UI component to interface with deployed contracts.
 **/
export const ContractUI = ({ contractName }: ContractUIProps) => {
  const { targetNetwork } = useTargetNetwork();
  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo({ contractName });

  if (deployedContractLoading) {
    return <div className="p-8 text-center text-xs font-mono text-[#797981]">Loading contract details...</div>;
  }

  if (!deployedContractData) {
    return (
      <div className="p-8 text-center text-xs font-mono text-[#797981] border border-dashed border-[#00000014] rounded-xl">
        No contract found for &quot;{String(contractName)}&quot; on network {targetNetwork.name}.
      </div>
    );
  }

  return <Contract contractName={contractName as string} contract={deployedContractData} chainId={targetNetwork.id} />;
};
