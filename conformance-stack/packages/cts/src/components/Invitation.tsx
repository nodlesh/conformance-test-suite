import React from "react";
import { useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { RootState } from "../store";
import useInvitationSocket from "../hooks/useInvitationSocket";
import { fetchInvitation } from "../api/api";
import QRCodeViewer from "./common/qr/QRViewer";
const InvitationListener: React.FC = () => {
  const [invite, setInvitation] = useState<string | null>(null);
  console.log("Setup invitation listener");
  useInvitationSocket();

  // Get state from the Redux store
  const { invitation, connectionStatus, error } = useSelector(
    (state: RootState) => {
      console.log("State accessed:", state.invitation); // Add this log to check if the state is accessed
      return state.invitation;
    }
  );

  useEffect(() => {
    console.log("Invitation updated: ", invitation);
    setInvitation(invitation);

    // fetchInvitation()
    //   .then((invitation) => {
    //     console.log("Invitation: ", invitation);
    //     setInvitation(invitation);
    //   })
    //   .catch((error) => {
    //     console.error("Error fetching invitation: ", error);
    //   });
  }, [invitation]);

  return (
    <div className="invitation-listener">
      <h2>Invitation Status</h2>
      <p>Connection Status: {connectionStatus}</p>
      {error && <p className="error">Error: {error}</p>}
      {invite ? (
        <div>
          <QRCodeViewer value={invite} />
        </div>
      ) : (
        <p>No invitation data available.</p>
      )}
    </div>
  );
};

export default InvitationListener;
