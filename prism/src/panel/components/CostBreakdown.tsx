import React from "react";

interface StepCost {
  stepId: string;
  agent: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  costUsd: number;
  durationMs: number;
  status: string;
}

interface CostBreakdownProps {
  steps: StepCost[];
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokensCached: number;
}

export const CostBreakdown: React.FC<CostBreakdownProps> = ({
  steps,
  totalCost,
  totalTokensIn,
  totalTokensOut,
  totalTokensCached,
}) => {
  if (steps.length === 0) {
    return (
      <div className="p-4 text-zinc-500 text-sm">
        No cost data available
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">Cost Breakdown</h3>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-zinc-800/50 rounded p-2">
          <div className="text-lg font-mono text-zinc-200">${totalCost.toFixed(4)}</div>
          <div className="text-xs text-zinc-500">Total Cost</div>
        </div>
        <div className="bg-zinc-800/50 rounded p-2">
          <div className="text-lg font-mono text-zinc-200">{(totalTokensIn + totalTokensOut).toLocaleString()}</div>
          <div className="text-xs text-zinc-500">Total Tokens</div>
        </div>
        <div className="bg-zinc-800/50 rounded p-2">
          <div className="text-lg font-mono text-zinc-200">{totalTokensCached.toLocaleString()}</div>
          <div className="text-xs text-zinc-500">Cached</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-1 px-2">Step</th>
              <th className="text-right py-1 px-2">In</th>
              <th className="text-right py-1 px-2">Out</th>
              <th className="text-right py-1 px-2">Cached</th>
              <th className="text-right py-1 px-2">Cost</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.stepId} className="border-b border-zinc-800/50">
                <td className="py-1 px-2 text-zinc-300">{step.stepId}</td>
                <td className="py-1 px-2 text-right font-mono text-zinc-400">{step.tokensIn.toLocaleString()}</td>
                <td className="py-1 px-2 text-right font-mono text-zinc-400">{step.tokensOut.toLocaleString()}</td>
                <td className="py-1 px-2 text-right font-mono text-zinc-600">{step.tokensCached.toLocaleString()}</td>
                <td className="py-1 px-2 text-right font-mono text-zinc-300">${step.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
