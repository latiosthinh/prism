export class PrismBudgetError extends Error {
  public readonly spentUsd: number;
  public readonly budgetUsd: number;
  public readonly stepId?: string;

  constructor(
    message: string,
    spentUsd: number,
    budgetUsd: number,
    stepId?: string,
  ) {
    super(message);
    this.name = "PrismBudgetError";
    this.spentUsd = spentUsd;
    this.budgetUsd = budgetUsd;
    this.stepId = stepId;
  }
}
