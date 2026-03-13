// src/components/NodeCard.tsx

import React from "react";
import { TaskNode } from "../../types/DAGNode";
import { GreenCheckIcon, FailedCheckIcon } from "../common/icons/Checks";
import { DefaultSpinner } from "../common/icons/Spinner";

interface NodeCardProps {
  node: TaskNode;
}

const NodeCard: React.FC<NodeCardProps> = ({ node }) => {
  const renderStatusIcon = () => {
    switch (node.task.state.runState.toLowerCase()) {
      case "completed":
      case "passed":
        return <GreenCheckIcon />;
      case "failed":
        return <FailedCheckIcon />;
      case "running":
        return <DefaultSpinner />;
      default:
        return null;
    }
  };

  const getStatusColor = (value: string) => {
    switch (value) {
      case "completed":
      case "passed":
        return "bg-green-500";
      case "accepted":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "running":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="node-card bg-gray-700 p-4 rounded-lg shadow mb-4">
      <div className="flex items-center">
        {renderStatusIcon()}
        <span
          className={`ml-2 text-sm font-medium py-1 px-2 rounded-full ${getStatusColor(
            node.state.toLowerCase()
          )}`}
        >
          {node.state}
        </span>
        <span
          className={`ml-2 text-sm font-medium py-1 px-2 rounded-full ${getStatusColor(
            node.task.state.status.toLowerCase()
          )}`}
        >
          {node.task.state.status}
        </span>
        <span className="ml-2 text-lg">{node.name}</span>
      </div>
      <p className="text-left mt-2 text-white-400 text-md">
        {node.description}
      </p>
      <div className="messages text-left">
        <ul>
          {node.task.state.messages.map((message, index) => {
            return (
              <li key={index} className="text-gray-400 text-sm">
                {message}
              </li>
            );
          })}
        </ul>
        <div className="warnings">
          <ul>
            {node.task.state.warnings.map((message, index) => {
              return (
                <li key={index} className="text-yellow-400 text-sm">
                  {message}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="errors">
          <ul>
            {node.task.state.errors.map((message, index) => {
              return (
                <li key={index} className="text-red-400 text-sm">
                  {message}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NodeCard;
