import { DebugContracts } from "./_components/DebugContracts";
import type { NextPage } from "next";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Debug Contracts",
  description: "Debug your deployed Scaffold-HBAR contracts in an easy way",
});

const Debug: NextPage = () => {
  return (
    <div className="flex-1 bg-[#fafafb] text-[#111114] select-none py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="pb-4 border-b border-[#00000014]">
          <h1 className="text-xl font-bold tracking-tight text-[#111114]">Contract Debug</h1>
          <p className="text-xs text-[#5a5a61] mt-1">
            Directly test, inspect, and interact with deployed Hedera smart contracts.
          </p>
        </div>
        <DebugContracts />
      </div>
    </div>
  );
};

export default Debug;
