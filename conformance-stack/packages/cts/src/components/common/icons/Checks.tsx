import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";

export function GreenCheckIcon() {
  return <CheckCircleIcon className={`h-5 w-5 text-green-400`} />;
}

export function FailedCheckIcon() {
  return <XCircleIcon className="h-5 w-5 text-red-400" />;
}
