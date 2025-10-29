// API client for Flask backend
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";

export interface PredictionRequest {
  category: string;
  current_stock: number;
}

export interface PredictionResponse {
  category: string;
  pred_next_week_units: number;
  current_stock: number;
  decision: "restock" | "ok" | "overstock";
  reorder_qty: number;
  safety_stock_estimate: number;
}

/**
 * Check if the backend API is available
 */
export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/`, {
      method: "GET",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      console.error(`API health check failed with status: ${response.status}`);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error("API health check failed:", error);
    if (error instanceof TypeError && error.message.includes("fetch")) {
      console.error(`Cannot connect to backend at ${API_BASE_URL}. Make sure the Flask server is running.`);
    }
    return false;
  }
};

/**
 * Get a single prediction for a product
 */
export const getPrediction = async (
  category: string,
  currentStock: number
): Promise<PredictionResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category,
        current_stock: currentStock,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform backend response to match frontend interface
    const predictedSales = data.predicted_sales || 0;
    const safetyStock = predictedSales * 1.2; // 20% buffer
    const reorderQty = Math.max(0, Math.ceil(safetyStock - currentStock));
    
    // Determine decision based on recommendation and predicted sales
    let decision: "restock" | "ok" | "overstock";
    if (data.recommendation === "Understock" || predictedSales > currentStock * 1.5) {
      decision = "restock";
    } else if (data.recommendation === "Overstock" || predictedSales < currentStock * 0.5) {
      decision = "overstock";
    } else {
      decision = "ok";
    }
    
    return {
      category: category.toLowerCase(),
      pred_next_week_units: predictedSales,
      current_stock: currentStock,
      decision,
      reorder_qty: reorderQty,
      safety_stock_estimate: Math.round(safetyStock * 100) / 100,
    };
  } catch (error: any) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(`Cannot connect to backend at ${API_BASE_URL}. Please ensure the Flask server is running.`);
    }
    throw error;
  }
};

/**
 * Get bulk predictions for multiple products
 */
export const getBulkPredictions = async (
  predictions: PredictionRequest[]
): Promise<PredictionResponse[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/bulk_predict`, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(predictions),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  } catch (error: any) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(`Cannot connect to backend at ${API_BASE_URL}. Please ensure the Flask server is running.`);
    }
    throw error;
  }
};

