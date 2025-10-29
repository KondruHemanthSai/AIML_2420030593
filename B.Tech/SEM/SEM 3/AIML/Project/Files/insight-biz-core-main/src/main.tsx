import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found!");
}

try {
  const root = createRoot(rootElement);
  root.render(<App />);
} catch (error) {
  console.error("Failed to render application:", error);
  rootElement.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; padding: 20px;">
      <div style="text-align: center;">
        <h1 style="color: #ef4444; margin-bottom: 16px;">Application Error</h1>
        <p style="color: #666; margin-bottom: 8px;">Failed to start the application.</p>
        <p style="color: #999; font-size: 14px;">Please check the browser console for details.</p>
        <pre style="margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: left; overflow-x: auto;">
${error instanceof Error ? error.message : String(error)}
        </pre>
      </div>
    </div>
  `;
}
