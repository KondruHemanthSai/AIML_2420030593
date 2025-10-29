import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, X, Send, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getChatResponse } from "@/lib/chatbot-api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your sales and commerce expert. Ask me anything about inventory management, sales trends, promotions, or business insights. I'll give you concise, expert answers!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Fetch comprehensive business data for context
      const { data: products } = await supabase
        .from("products")
        .select("id, name, sku, stock_quantity, low_stock_threshold, selling_price, cost_price, categories(name)")
        .order("stock_quantity", { ascending: true });

      const { data: orders } = await supabase
        .from("orders")
        .select("total, created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);

      // Analyze stock data
      const stockAnalysis = analyzeStockData(products || []);

      const businessContext = {
        products: products || [],
        recentOrders: orders || [],
        totalProducts: products?.length || 0,
        recentRevenue: orders?.reduce((sum, o) => sum + Number(o.total), 0) || 0,
        stockAnalysis,
      };

      const response = await getChatResponse(userMessage.content, businessContext);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chatbot error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Analyze stock data for insights
  const analyzeStockData = (products: any[]) => {
    if (!products || products.length === 0) {
      return {
        totalProducts: 0,
        totalStockValue: 0,
        lowStockItems: [],
        outOfStockItems: [],
        categoryBreakdown: {},
        stockStatus: "no_data"
      };
    }

    const lowStockItems = products.filter(p => 
      p.stock_quantity <= p.low_stock_threshold && p.stock_quantity > 0
    );
    const outOfStockItems = products.filter(p => p.stock_quantity === 0);
    
    // Calculate total inventory value
    const totalStockValue = products.reduce((sum, p) => 
      sum + (Number(p.stock_quantity || 0) * Number(p.cost_price || 0)), 0
    );

    // Category breakdown
    const categoryBreakdown: Record<string, { count: number; totalStock: number; lowStock: number }> = {};
    products.forEach(p => {
      const catName = p.categories?.name || "Uncategorized";
      if (!categoryBreakdown[catName]) {
        categoryBreakdown[catName] = { count: 0, totalStock: 0, lowStock: 0 };
      }
      categoryBreakdown[catName].count++;
      categoryBreakdown[catName].totalStock += Number(p.stock_quantity || 0);
      if (p.stock_quantity <= p.low_stock_threshold) {
        categoryBreakdown[catName].lowStock++;
      }
    });

    // Determine overall stock status
    const lowStockPercentage = (lowStockItems.length / products.length) * 100;
    const stockStatus = 
      lowStockPercentage > 30 ? "critical" :
      lowStockPercentage > 15 ? "warning" :
      outOfStockItems.length > 0 ? "needs_attention" :
      "healthy";

    return {
      totalProducts: products.length,
      totalStockValue,
      totalStockUnits: products.reduce((sum, p) => sum + Number(p.stock_quantity || 0), 0),
      lowStockItems: lowStockItems.map(p => ({
        name: p.name,
        sku: p.sku,
        currentStock: p.stock_quantity,
        threshold: p.low_stock_threshold,
        category: p.categories?.name || "Uncategorized"
      })),
      outOfStockItems: outOfStockItems.map(p => ({
        name: p.name,
        sku: p.sku,
        category: p.categories?.name || "Uncategorized"
      })),
      categoryBreakdown,
      stockStatus,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      lowStockPercentage: Math.round(lowStockPercentage * 10) / 10
    };
  };

  return (
    <>
      {/* Floating Chat Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90"
        size="icon"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </Button>

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-96 h-[600px] flex flex-col shadow-2xl z-50 border-2">
          {/* Header */}
          <div className="p-4 border-b bg-primary text-primary-foreground rounded-t-lg">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <h3 className="font-semibold">Sales & Commerce Expert</h3>
            </div>
            <p className="text-xs opacity-90 mt-1">Ask me about inventory, sales, trends, or promotions</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-background border rounded-lg p-3">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                    <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                    <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-background rounded-b-lg">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about inventory, sales, trends..."
                disabled={loading}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
};

export default Chatbot;

