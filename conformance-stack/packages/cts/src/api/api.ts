import axiosClient from "./axiosClient";

// Fetch Invitation data from the server
export const fetchInvitation = async () => {
  try {
    const response = await axiosClient.get("/api/invitation");
    return response.data.invite;
  } catch (error) {
    console.error("Error fetching invitation:", error);
    throw error;
  }
};
// Fetch DAG data from the server
export const fetchDAG = async () => {
  try {
    const response = await axiosClient.get("/api/dag");
    return response.data.dag;
  } catch (error) {
    console.error("Error fetching DAG:", error);
    throw error;
  }
};

// Run the pipeline with optional params
export const run = async (params?: any) => {
  try {
    await axiosClient.post("/api/run", params || {});
  } catch (error) {
    console.error("Error running pipeline:", error);
    throw error;
  }
};

// Fetch DAG data from the server
export const selectPipeline = async (pipeline: string) => {
  try {
    const response = await axiosClient.get("/api/select/pipeline", {
      params: {
        pipeline: pipeline,
      },
    });
    return response;
  } catch (error) {
    console.error("Error fetching DAG:", error);
    throw error;
  }
};
