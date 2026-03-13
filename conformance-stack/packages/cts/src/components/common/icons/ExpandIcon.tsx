import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";

export function CollapseIcon() {
  return <FontAwesomeIcon icon={faChevronUp} className="h-4 w-4 mr-1" />;
}

export function ExpandIcon() {
  return <FontAwesomeIcon icon={faChevronDown} className="h-4 w-4 mr-1" />;
}
