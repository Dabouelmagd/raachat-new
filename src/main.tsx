import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { applyTextScale } from "./theme/textScale";
import App from "./App";
import "./index.css";
import { startUpdateWatch } from "./update";

startUpdateWatch();

applyTextScale(); // حجم الخط المحفوظ قبل أول رسم عشان مفيش قفزة
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MemoryRouter>
      <App />
    </MemoryRouter>
  </React.StrictMode>
);
