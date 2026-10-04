"use client";

import { useEffect, useMemo } from "react";
import { ContractUI } from "./ContractUI";
import "@scaffold-hbar-ui/debug-contracts/styles.css";
import { useSessionStorage } from "usehooks-ts";
import { BarsArrowUpIcon } from "@heroicons/react/20/solid";
import { ContractName, GenericContract } from "~~/utils/scaffold-hbar/contract";
import { useAllContracts } from "~~/utils/scaffold-hbar/contractsData";

const selectedContractStorageKey = "scaffoldEth2.selectedContract";

export function DebugContracts() {
  const contractsData = useAllContracts();
  const contractNames = useMemo(
    () =>
      Object.keys(contractsData).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      }) as ContractName[],
    [contractsData],
  );

  const [selectedContract, setSelectedContract] = useSessionStorage<ContractName>(
    selectedContractStorageKey,
    contractNames[0],
    { initializeWithValue: false },
  );

  useEffect(() => {
    if (!contractNames.includes(selectedContract)) {
      setSelectedContract(contractNames[0]);
    }
  }, [contractNames, selectedContract, setSelectedContract]);

  return (
    <div className="flex flex-col gap-y-6 w-full">
      {contractNames.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[#00000014] rounded-xl text-xs text-[#797981]">
          No deployed contracts found on this network.
        </div>
      ) : (
        <>
          {contractNames.length > 1 && (
            <div className="flex flex-row gap-2 w-full pb-1 flex-wrap">
              {contractNames.map(contractName => (
                <button
                  className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                    contractName === selectedContract
                      ? "bg-[#111114] text-white border-[#111114] font-semibold"
                      : "bg-white text-[#111114] hover:bg-[#eeeef1] border-[#00000014]"
                  }`}
                  key={String(contractName)}
                  onClick={() => setSelectedContract(contractName)}
                >
                  {String(contractName)}
                  {(contractsData[String(contractName)] as GenericContract)?.external && (
                    <span title="External contract">
                      <BarsArrowUpIcon className="size-3.5 text-[#797981]" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {contractNames.map(
            contractName =>
              contractName === selectedContract && (
                <ContractUI key={String(contractName)} contractName={contractName} />
              ),
          )}
        </>
      )}
    </div>
  );
}
