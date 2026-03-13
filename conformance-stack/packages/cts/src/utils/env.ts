export const serverPort: number =
  Number(process.env.REACT_APP_SERVER_PORT) || 5005; // Use REACT_APP prefix for Create React App

export const SOCKET_SERVER_URL = process.env.BASE_API_URL
  ? process.env.BASE_API_URL
  : `http://localhost:${serverPort}`;
