import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function DefaultSpinner() {
  return (
    <FontAwesomeIcon
      icon={faSpinner}
      className="animate-spin h-5 w-5 text-yellow-400 mr-2"
    />
  );
}
