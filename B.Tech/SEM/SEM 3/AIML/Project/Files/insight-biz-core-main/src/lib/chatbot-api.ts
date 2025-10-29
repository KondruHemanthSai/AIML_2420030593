// Chatbot API service using OpenAI-compatible API
// You can use OpenAI API or any compatible service
const CHATBOT_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";
const CHATBOT_API_URL = import.meta.env.VITE_OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";

interface StockAnalysis {
  totalProducts: number;
  totalStockValue: number;
  totalStockUnits: number;
  lowStockItems: Array<{
    name: string;
    sku: string;
    currentStock: number;
    threshold: number;
    category: string;
  }>;
  outOfStockItems: Array<{
    name: string;
    sku: string;
    category: string;
  }>;
  categoryBreakdown: Record<string, { count: number; totalStock: number; lowStock: number }>;
  stockStatus: string;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockPercentage: number;
}

interface BusinessContext {
  products: any[];
  recentOrders: any[];
  totalProducts: number;
  recentRevenue: number;
  stockAnalysis: StockAnalysis;
}

/**
 * Get chat response from AI assistant
 * Uses OpenAI GPT-3.5-turbo or compatible API
 */
export const getChatResponse = async (
  userMessage: string,
  context: BusinessContext
): Promise<string> => {
  try {
    // If no API key, use a fallback response
    if (!CHATBOT_API_KEY) {
      return getFallbackResponse(userMessage, context);
    }

    // Build context-aware system prompt with detailed stock analysis
    const stock = context.stockAnalysis;
    const lowStockList = stock.lowStockItems.slice(0, 5).map(item => 
      `${item.name} (Stock: ${item.currentStock}, Threshold: ${item.threshold})`
    ).join(", ");
    
    const categoryDetails = Object.entries(stock.categoryBreakdown)
      .map(([cat, data]) => `${cat}: ${data.count} products, ${data.totalStock} units, ${data.lowStock} low stock`)
      .join("; ");

    const systemPrompt = `You are an expert sales and commerce advisor with a PhD in Business Analytics. You specialize in inventory management, sales optimization, market trends, and promotional strategies.

Your role:
- Provide concise, actionable advice (1-2 lines maximum per response)
- Analyze stock data when questions require it
- Focus on inventory management, sales trends, and promotions
- Use actual product and stock data from the business
- Be professional but friendly

CURRENT INVENTORY ANALYSIS:
- Total Products: ${stock.totalProducts}
- Total Stock Value: ₹${stock.totalStockValue.toFixed(2)}
- Total Stock Units: ${stock.totalStockUnits}
- Stock Status: ${stock.stockStatus === "critical" ? "CRITICAL" : stock.stockStatus === "warning" ? "WARNING" : "HEALTHY"}
- Low Stock Items: ${stock.lowStockCount} (${stock.lowStockPercentage}% of inventory)
- Out of Stock: ${stock.outOfStockCount} items
- Low Stock Products: ${lowStockList || "None"}
- Category Breakdown: ${categoryDetails || "N/A"}
- Recent Revenue (last 20 orders): ₹${context.recentRevenue.toFixed(2)}

When asked about stock, inventory, or products, use the actual data above to provide specific insights. 

IMPORTANT:
- For festival/seasonal questions (Diwali, holidays): Recommend increasing stock by 150-200% for peak demand
- For "should I restock" questions: Check lowStockCount and outOfStockCount, give YES/NO with specific items
- Always provide actionable, specific recommendations with actual product names and quantities
- Be direct and data-driven - use actual stock numbers, not generic advice

Always keep responses brief and to the point (1-2 lines).`;

    // Build user message with context
    const userPrompt = `${userMessage}

CURRENT STOCK DATA:
- Total Products: ${stock.totalProducts}
- Items needing restock: ${stock.lowStockCount} (${stock.lowStockPercentage}% of inventory)
- Out of stock: ${stock.outOfStockCount}
- Low stock items: ${stock.lowStockItems.slice(0, 5).map(i => `${i.name} (${i.currentStock}/${i.threshold})`).join(", ") || "None"}
- Out of stock items: ${stock.outOfStockItems.slice(0, 3).map(i => i.name).join(", ") || "None"}
- Inventory value: ₹${stock.totalStockValue.toFixed(2)}
- Total stock units: ${stock.totalStockUnits}
- Recent revenue: ₹${context.recentRevenue.toFixed(2)}

Provide a specific, actionable answer using this actual data.`;

    const response = await fetch(CHATBOT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHATBOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "I apologize, but I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("Chatbot API error:", error);
    // Return fallback response on error
    return getFallbackResponse(userMessage, context);
  }
};

/**
 * Fallback response when API is not available
 * Provides basic rule-based responses
 */
const getFallbackResponse = (userMessage: string, context: BusinessContext): string => {
  const lowerMessage = userMessage.toLowerCase();

  // Inventory-related queries with detailed stock analysis
  if (lowerMessage.includes("inventory") || lowerMessage.includes("stock") || lowerMessage.includes("product")) {
    const stock = context.stockAnalysis;
    
    if (stock.totalProducts === 0) {
      return "No products in inventory. Add products to start tracking stock levels.";
    }

    if (stock.outOfStockCount > 0 && stock.lowStockCount > 0) {
      const outOfStockNames = stock.outOfStockItems.slice(0, 2).map(i => i.name).join(", ");
      return `⚠️ Urgent: ${stock.outOfStockCount} items out of stock (${outOfStockNames}) and ${stock.lowStockCount} low stock items. Prioritize restocking to prevent lost sales.`;
    }

    if (stock.outOfStockCount > 0) {
      const outOfStockNames = stock.outOfStockItems.slice(0, 2).map(i => i.name).join(", ");
      return `⚠️ ${stock.outOfStockCount} items are out of stock: ${outOfStockNames}. Restock immediately to avoid sales loss.`;
    }

    if (stock.lowStockCount > 0) {
      const lowStockNames = stock.lowStockItems.slice(0, 3).map(i => `${i.name} (${i.currentStock}/${i.threshold})`).join(", ");
      return `${stock.lowStockCount} items need restocking (${stock.lowStockPercentage}% of inventory): ${lowStockNames}. Order soon to maintain stock levels.`;
    }

    if (lowerMessage.includes("how many") || lowerMessage.includes("count") || lowerMessage.includes("total")) {
      return `You have ${stock.totalProducts} products with ${stock.totalStockUnits} total units in stock. Inventory value: ₹${stock.totalStockValue.toFixed(2)}.`;
    }

    return `Inventory healthy: ${stock.totalProducts} products, ${stock.totalStockUnits} units (₹${stock.totalStockValue.toFixed(2)} value). Monitor slow-movers and adjust reorder points.`;
  }

  // Sales-related queries
  if (lowerMessage.includes("sales") || lowerMessage.includes("revenue") || lowerMessage.includes("revenue trend")) {
    if (context.recentRevenue > 0) {
      return `Recent sales show ₹${context.recentRevenue.toFixed(2)} in revenue. Analyze order patterns to identify peak sales periods and optimize inventory accordingly.`;
    }
    return `Focus on increasing average order value through cross-selling and upselling strategies. Consider bundling popular products together.`;
  }

  // Promotions with stock awareness
  if (lowerMessage.includes("promotion") || lowerMessage.includes("discount") || lowerMessage.includes("offer")) {
    const stock = context.stockAnalysis;
    const slowMoving = context.products.filter(p => p.stock_quantity > p.low_stock_threshold * 2);
    
    if (slowMoving.length > 0) {
      const topSlow = slowMoving
        .sort((a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0))
        .slice(0, 3)
        .map(p => p.name)
        .join(", ");
      return `Promote slow-moving items: ${topSlow}. Bundle with fast-sellers at 10-15% discount to clear excess inventory.`;
    }
    return `Focus promotions on overstocked categories. Bundle complementary products at 10-15% discount to boost sales velocity.`;
  }

  // Trends
  if (lowerMessage.includes("trend") || lowerMessage.includes("forecast") || lowerMessage.includes("predict")) {
    const avgRevenue = context.recentOrders.length > 0 
      ? context.recentRevenue / context.recentOrders.length 
      : 0;
    return `Based on recent data, maintain inventory levels at 1.5x your average weekly sales. Use seasonal patterns and historical data to forecast demand accurately.`;
  }

  // Category-specific queries
  if (lowerMessage.includes("category") || lowerMessage.includes("categories")) {
    const stock = context.stockAnalysis;
    const categories = Object.entries(stock.categoryBreakdown);
    if (categories.length > 0) {
      const categorySummary = categories
        .map(([cat, data]) => `${cat}: ${data.count} products, ${data.lowStock} need restock`)
        .slice(0, 3)
        .join("; ");
      return `Category breakdown: ${categorySummary}. Focus restocking on categories with high low-stock ratios.`;
    }
  }

  // Stock value queries
  if (lowerMessage.includes("value") || lowerMessage.includes("worth") || lowerMessage.includes("investment")) {
    const stock = context.stockAnalysis;
    return `Total inventory value: ₹${stock.totalStockValue.toFixed(2)} across ${stock.totalProducts} products. Average value per product: ₹${(stock.totalStockValue / stock.totalProducts).toFixed(2)}.`;
  }

  // Festival/Seasonal queries (Diwali, Christmas, etc.)
  if (lowerMessage.includes("diwali") || lowerMessage.includes("festival") || lowerMessage.includes("seasonal") || lowerMessage.includes("holiday")) {
    const stock = context.stockAnalysis;
    const lowStockNames = stock.lowStockItems.slice(0, 5).map(i => i.name).join(", ");
    
    if (stock.lowStockCount > 0) {
      return `YES, restock before Diwali! ${stock.lowStockCount} items are low: ${lowStockNames}. Diwali sales typically increase 2-3x - restock ${stock.lowStockItems.slice(0, 3).map(i => i.name).join(", ")} immediately to avoid stockouts during peak demand.`;
    }
    if (stock.totalStockUnits > 0) {
      return `Pre-Diwali stock looks good (${stock.totalStockUnits} units). However, anticipate 2-3x demand surge - consider increasing inventory by 150% for fast-moving items during festive season.`;
    }
    return `Diwali is peak season - expect 2-3x normal sales. Stock up on popular items now to meet increased demand.`;
  }

  // Specific restock questions
  if ((lowerMessage.includes("should") && lowerMessage.includes("restock")) || 
      (lowerMessage.includes("restock") && (lowerMessage.includes("now") || lowerMessage.includes("when")))) {
    const stock = context.stockAnalysis;
    
    if (stock.outOfStockCount > 0) {
      const outOfStockNames = stock.outOfStockItems.slice(0, 3).map(i => i.name).join(", ");
      return `YES, urgent restock needed! ${stock.outOfStockCount} items are sold out: ${outOfStockNames}. Restock immediately to prevent sales loss.`;
    }
    
    if (stock.lowStockCount > 0) {
      const lowStockNames = stock.lowStockItems.slice(0, 4).map(i => `${i.name} (${i.currentStock} left)`).join(", ");
      return `Yes, restock ${stock.lowStockCount} items now: ${lowStockNames}. Current stock is below threshold - order soon to maintain availability.`;
    }
    
    return `No urgent restock needed. Your inventory is healthy. Monitor sales velocity and reorder when items reach 50% of threshold.`;
  }

  // General advice with stock context
  if (lowerMessage.includes("how") || lowerMessage.includes("what") || lowerMessage.includes("advice") || lowerMessage.includes("recommend")) {
    const stock = context.stockAnalysis;
    if (stock.stockStatus === "critical") {
      return `URGENT: ${stock.lowStockCount} items need restocking. Prioritize reorders for ${stock.lowStockItems.slice(0, 2).map(i => i.name).join(" and ")} to prevent stockouts.`;
    }
    if (stock.stockStatus === "warning") {
      return `Warning: ${stock.lowStockCount} items (${stock.lowStockPercentage}%) are low stock. Review and restock ${stock.lowStockItems.slice(0, 3).map(i => i.name).join(", ")} soon.`;
    }
    return `Optimize inventory with ABC analysis: prioritize high-value fast-movers, maintain safety stock, use data-driven reorder points based on sales velocity.`;
  }

  // Default response - more helpful
  const stock = context.stockAnalysis;
  if (stock.totalProducts > 0) {
    const summary = stock.lowStockCount > 0 
      ? `${stock.lowStockCount} items need restocking`
      : stock.outOfStockCount > 0
      ? `${stock.outOfStockCount} items are out of stock`
      : `Inventory is healthy`;
    return `I have access to your ${stock.totalProducts} products and stock data. ${summary}. Ask me specific questions like "which items need restocking?", "what's my inventory worth?", or "should I restock for Diwali?"`;
  }
  return `I can help with inventory management, sales optimization, trend analysis, and promotional strategies. Add products to get specific insights about your stock!`;
};

