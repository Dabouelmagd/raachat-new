import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { startUpdateWatch } from "./update.js";
createRoot(document.getElementById("root")).render(<App />);
startUpdateWatch(); // بعد كل نشر: بتاخد النسخة الجديدة لوحدها بدل ما تقعد على القديمة
