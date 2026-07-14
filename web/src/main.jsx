import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FebraHub from "./FebraHub.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <FebraHub />
  </StrictMode>
);
