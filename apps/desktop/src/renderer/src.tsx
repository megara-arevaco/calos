import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queries/queryClient.js";
import "./styles.css";
import { App } from "./components/App/index.js";
const root = document.getElementById("root");

if (!root) {
  throw new Error("No se encontró el elemento raíz");
}
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
