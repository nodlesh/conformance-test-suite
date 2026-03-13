import axios from "axios";
import { SOCKET_SERVER_URL } from "../utils/env";

// Create an Axios instance with a base URL

const axiosClient = axios.create({
  baseURL: SOCKET_SERVER_URL,
  timeout: 10000, // Timeout after 10 seconds
});

// Request interceptor for setting headers or handling configurations globally
axiosClient.interceptors.request.use(
  (config) => {
    // You can add authorization headers here if needed
    // config.headers.Authorization = `Bearer ${yourToken}`;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors globally
axiosClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error("API call error:", error);
    return Promise.reject(error);
  }
);

export default axiosClient;
