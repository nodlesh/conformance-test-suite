import { RunnableState } from "@demo/core/pipeline/src/types";

export const getStateColor = (state: RunnableState): string => {
  switch (state) {
    case RunnableState.NOT_STARTED:
      return "bg-neutral";
    case RunnableState.STARTED:
      return "bg-info";
    case RunnableState.RUNNING:
      return "bg-progress";
    case RunnableState.COMPLETED:
      return "bg-success";
    case RunnableState.ACCEPTED:
      return "bg-success";
    case RunnableState.FAILED:
      return "bg-error";
    default:
      return "bg-neutral";
  }
};
