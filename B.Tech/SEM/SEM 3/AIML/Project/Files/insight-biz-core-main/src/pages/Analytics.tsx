import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, TrendingUp, Package, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBulkPredictions, checkApiHealth, type PredictionResponse } from "@/lib/api";
import { toast } from "sonner";
import { formatCurrency, formatNumber } from "@/lib/utils";

const Analytics = () => {
  const [allPredictions, setAllPredictions] = useState<(PredictionResponse & { product_name?: string; product_sku?: string })[]>([]);
  const [restockSuggestions, setRestockSuggestions] = useState<PredictionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [filterStatus, setFilterStatus] = useState<"all" | "restock" | "ok" | "overstock">("all");
  const [salesData, setSalesData] = useState<any>({
    last30DaysRevenue: 0,
    last7DaysRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    forecastNext90Days: 0
  });
  const [performanceData, setPerformanceData] = useState<any>({
    inventoryValue: 0,
    stockToSalesRatio: 0,
    daysOfSupply: 0
  });

  const fetchSalesData = useCallback(async () => {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Fetch orders from last 30 days
      const { data: orders30Days } = await supabase
        .from("orders")
        .select("total")
        .eq("status", "completed")
        .gte("created_at", last30Days.toISOString());
      
      // Fetch orders from last 7 days
      const { data: orders7Days } = await supabase
        .from("orders")
        .select("total")
        .eq("status", "completed")
        .gte("created_at", last7Days.toISOString());
      
      // Fetch all completed orders count
      const { data: allOrders } = await supabase
        .from("orders")
        .select("id, total")
        .eq("status", "completed");
      
      const last30DaysRevenue = orders30Days?.reduce((sum, o) => sum + Number(o.total), 0) || 0;
      const last7DaysRevenue = orders7Days?.reduce((sum, o) => sum + Number(o.total), 0) || 0;
      const totalOrders = allOrders?.length || 0;
      const avgOrderValue = totalOrders > 0 
        ? (allOrders?.reduce((sum, o) => sum + Number(o.total), 0) || 0) / totalOrders 
        : 0;
      
      // Forecast next 90 days: average daily revenue * 90
      const dailyAvg = last30DaysRevenue / 30;
      const forecastNext90Days = dailyAvg * 90;
      
      setSalesData({
        last30DaysRevenue,
        last7DaysRevenue,
        totalOrders,
        avgOrderValue,
        forecastNext90Days
      });
    } catch (error) {
      console.error("Error fetching sales data:", error);
    }
  }, []);

  const fetchPerformanceData = useCallback(async () => {
    try {
      // Fetch all products with their costs
      const { data: productsData } = await supabase
        .from("products")
        .select("stock_quantity, cost_price");
      
      if (!productsData) return;
      
      // Calculate inventory value
      const inventoryValue = productsData.reduce(
        (sum, p) => sum + (Number(p.stock_quantity) * Number(p.cost_price || 0)), 
        0
      );
      
      // Fetch sales data for stock-to-sales ratio
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const { data: ordersData } = await supabase
        .from("order_items")
        .select("quantity, unit_price")
        .gte("created_at", last30Days.toISOString());
      
      const sales30Days = ordersData?.reduce(
        (sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 
        0
      ) || 0;
      
      // Stock-to-sales ratio = Inventory Value / Sales (last 30 days)
      const stockToSalesRatio = sales30Days > 0 ? inventoryValue / sales30Days : 0;
      
      // Days of supply = (Inventory Value / Daily Sales) 
      const dailySales = sales30Days / 30;
      const daysOfSupply = dailySales > 0 ? inventoryValue / dailySales : 0;
      
      setPerformanceData({
        inventoryValue,
        stockToSalesRatio,
        daysOfSupply
      });
    } catch (error) {
      console.error("Error fetching performance data:", error);
    }
  }, []);

  const fetchPredictions = useCallback(async (productsData?: any[]) => {
    setLoading(true);
    try {
      const productsToPredict = productsData || products;
      
      if (productsToPredict.length === 0) {
        toast.info("No products found to analyze");
        return;
      }

      // Map products to prediction requests
      const predictionRequests = productsToPredict
        .filter(p => p.categories?.name && p.stock_quantity !== undefined)
        .map(p => ({
          category: p.categories.name,
          current_stock: p.stock_quantity || 0,
        }));

      if (predictionRequests.length === 0) {
        // If API not connected, still show product list with mock data
        if (!apiConnected) {
          const mockPredictions = productsToPredict.map(p => ({
            category: p.categories?.name || "Unknown",
            pred_next_week_units: p.stock_quantity * 0.3, // Estimate 30% of stock
            current_stock: p.stock_quantity || 0,
            decision: p.stock_quantity < (p.low_stock_threshold || 10) ? "restock" as const : "ok" as const,
            reorder_qty: Math.max(0, (p.low_stock_threshold || 10) - p.stock_quantity),
            safety_stock_estimate: p.low_stock_threshold || 10,
            product_name: p.name,
            product_sku: p.sku || "N/A",
          }));
          setAllPredictions(mockPredictions);
          setRestockSuggestions(mockPredictions.filter(p => p.decision === "restock"));
          setLoading(false);
        }
        return;
      }

      const predictions = await getBulkPredictions(predictionRequests);
      
      // Merge predictions with product data - show ALL predictions
      const allPreds = predictions.map(pred => {
        const product = productsToPredict.find(p => 
          p.categories?.name === pred.category
        );
        // Find matching product by matching category
        const matchedProduct = productsToPredict.find(p => 
          (p.categories?.name || "").toLowerCase() === pred.category.toLowerCase()
        );
        return {
          ...pred,
          product_name: matchedProduct?.name || pred.category,
          product_sku: matchedProduct?.sku || "N/A",
        };
      }).sort((a, b) => {
        // Sort restock items first, then by reorder quantity
        if (a.decision === "restock" && b.decision !== "restock") return -1;
        if (a.decision !== "restock" && b.decision === "restock") return 1;
        return b.reorder_qty - a.reorder_qty;
      });

      setAllPredictions(allPreds);
      
      // Filter restock suggestions
      const suggestions = allPreds.filter(pred => pred.decision === "restock");
      setRestockSuggestions(suggestions);
      
      if (suggestions.length > 0) {
        toast.success(`Analyzed ${allPreds.length} products. ${suggestions.length} need restocking`);
      } else {
        toast.success(`Analyzed ${allPreds.length} products. All are adequately stocked`);
      }
    } catch (error: any) {
      console.error("Error fetching predictions:", error);
      // On error, show products anyway with estimated data
      const productsToPredict = productsData || products;
      const mockPredictions = productsToPredict.map(p => ({
        category: p.categories?.name || "Unknown",
        pred_next_week_units: p.stock_quantity * 0.3,
        current_stock: p.stock_quantity || 0,
        decision: p.stock_quantity < (p.low_stock_threshold || 10) ? "restock" as const : "ok" as const,
        reorder_qty: Math.max(0, (p.low_stock_threshold || 10) - p.stock_quantity),
        safety_stock_estimate: p.low_stock_threshold || 10,
        product_name: p.name,
        product_sku: p.sku || "N/A",
      }));
      setAllPredictions(mockPredictions);
      setRestockSuggestions(mockPredictions.filter(p => p.decision === "restock"));
      toast.error("API unavailable. Showing estimated predictions based on stock levels.");
    } finally {
      setLoading(false);
    }
  }, [products, apiConnected]);


  useEffect(() => {
    const initialize = async () => {
      try {
        const connected = await checkApiHealth();
        setApiConnected(connected);
        if (!connected) {
          const apiUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
          toast.error(`Backend API is not available. Please ensure the Flask server is running at ${apiUrl}`);
        }
        
        // Fetch products after checking API
        const { data, error } = await supabase
          .from("products")
          .select("*, categories(name)")
          .order("stock_quantity", { ascending: true });
        
        if (error) {
          console.error("Error fetching products:", error);
          return;
        }
        
        if (data) {
          setProducts(data);
          // Always fetch predictions (will use mock data if API not connected)
          fetchPredictions(data);
        }
        
        // Fetch sales and performance data
        fetchSalesData();
        fetchPerformanceData();
      } catch (error) {
        console.error("Error initializing Analytics:", error);
      }
    };
    
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPriorityBadge = (reorderQty: number, currentStock: number) => {
    if (reorderQty > currentStock * 2) return { label: "Critical", variant: "destructive" as const };
    if (reorderQty > currentStock) return { label: "High Priority", variant: "default" as const };
    return { label: "Normal", variant: "secondary" as const };
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">AI & Analytics</h1>
        <p className="text-muted-foreground">AI-powered insights and forecasting for your business</p>
      </div>

            <Tabs defaultValue="suggestions" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="suggestions">
                  <Brain className="h-4 w-4 mr-2" />
                  AI Suggestions
                </TabsTrigger>
                <TabsTrigger value="performance">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Performance
                </TabsTrigger>
              </TabsList>

        <TabsContent value="suggestions" className="space-y-6">
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Sales Forecast</CardTitle>
              <CardDescription>Revenue forecast for the next 90 days based on historical data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-sm text-muted-foreground mb-1">Last 7 Days</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(salesData.last7DaysRevenue)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-sm text-muted-foreground mb-1">Last 30 Days</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(salesData.last30DaysRevenue)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
                    <p className="text-sm text-muted-foreground mb-1">Forecast (90 Days)</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(salesData.forecastNext90Days)}</p>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Orders</p>
                      <p className="text-lg font-semibold">{formatNumber(salesData.totalOrders)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg Order Value</p>
                      <p className="text-lg font-semibold">{formatCurrency(salesData.avgOrderValue)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-medium">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Restock Suggestions</CardTitle>
                  <CardDescription>AI-recommended products to reorder</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    fetchPredictions();
                    fetchSalesData();
                    fetchPerformanceData();
                  }}
                  disabled={loading}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <RefreshCw className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
                    <p>Analyzing products and generating predictions...</p>
                  </div>
                </div>
              ) : allPredictions.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Package className="h-12 w-12 mx-auto mb-4 text-primary" />
                    <p className="mb-2">No products found</p>
                    <p className="text-sm">Add products in the Inventory page to see predictions</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {allPredictions.length > 0 && (
                    <>
                      <div className="mb-4 p-3 rounded-lg bg-muted/30">
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <span>
                            Showing <span className="font-semibold">{allPredictions.length}</span> products analyzed.{" "}
                          </span>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className={`font-semibold ${restockSuggestions.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                              🔴 {restockSuggestions.length} need restocking
                            </span>
                            <span className="text-green-600 dark:text-green-400">
                              ✅ {allPredictions.filter(p => p.decision === "ok").length} adequately stocked
                            </span>
                            <span className="text-yellow-600 dark:text-yellow-400">
                              🟡 {allPredictions.filter(p => p.decision === "overstock").length} overstocked
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Filter Selector */}
                      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Filter by stock status:</span>
                          <Select
                            value={filterStatus}
                            onValueChange={(value) => {
                              setFilterStatus(value as "all" | "restock" | "ok" | "overstock");
                              setCurrentPage(1);
                            }}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Products</SelectItem>
                              <SelectItem value="restock">🔴 Needs Restock (Understocked)</SelectItem>
                              <SelectItem value="ok">🟢 Adequate Stock</SelectItem>
                              <SelectItem value="overstock">🟡 Overstocked</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Items per page:</span>
                          <Select
                            value={itemsPerPage >= allPredictions.length ? "all" : itemsPerPage.toString()}
                            onValueChange={(value) => {
                              setItemsPerPage(value === "all" ? allPredictions.length : parseInt(value));
                              setCurrentPage(1);
                            }}
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">5</SelectItem>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="all">All</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {(() => {
                    // Filter predictions based on selected status
                    const filteredPredictions = filterStatus === "all" 
                      ? allPredictions 
                      : allPredictions.filter(p => p.decision === filterStatus);
                    
                    if (filteredPredictions.length === 0) {
                      return (
                        <div className="text-center py-12 text-muted-foreground">
                          <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
                          <p className="text-lg font-medium mb-2">No products found</p>
                          <p className="text-sm">
                            No products with "{filterStatus === "all" ? "any" : filterStatus === "restock" ? "restock (understocked)" : filterStatus === "ok" ? "adequate" : "overstock"}" status
                          </p>
                        </div>
                      );
                    }

                    // Calculate pagination
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const paginatedPredictions = filteredPredictions.slice(startIndex, endIndex);
                    const totalPages = Math.ceil(filteredPredictions.length / itemsPerPage);

                    return (
                      <>
                        {filterStatus === "restock" && filteredPredictions.length > 0 && (
                          <div className="mb-3">
                            <h4 className="font-semibold text-destructive">⚠️ Products Needing Restock (Understocked)</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {filteredPredictions.length} product{filteredPredictions.length !== 1 ? "s" : ""} {itemsPerPage >= filteredPredictions.length ? "" : `(showing ${startIndex + 1}-${Math.min(endIndex, filteredPredictions.length)} of ${filteredPredictions.length})`}
                            </p>
                          </div>
                        )}
                        {filterStatus === "overstock" && filteredPredictions.length > 0 && (
                          <div className="mb-3">
                            <h4 className="font-semibold text-yellow-600 dark:text-yellow-400">🟡 Overstocked Products</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {filteredPredictions.length} product{filteredPredictions.length !== 1 ? "s" : ""} {itemsPerPage >= filteredPredictions.length ? "" : `(showing ${startIndex + 1}-${Math.min(endIndex, filteredPredictions.length)} of ${filteredPredictions.length})`}
                            </p>
                          </div>
                        )}
                        {filterStatus === "ok" && filteredPredictions.length > 0 && (
                          <div className="mb-3">
                            <h4 className="font-semibold text-green-600 dark:text-green-400">✅ Adequately Stocked Products</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {filteredPredictions.length} product{filteredPredictions.length !== 1 ? "s" : ""} {itemsPerPage >= filteredPredictions.length ? "" : `(showing ${startIndex + 1}-${Math.min(endIndex, filteredPredictions.length)} of ${filteredPredictions.length})`}
                            </p>
                          </div>
                        )}
                        {filterStatus === "all" && filteredPredictions.length > 0 && (
                          <div className="mb-3 text-sm text-muted-foreground">
                            {itemsPerPage >= filteredPredictions.length ? (
                              <span>Showing all {filteredPredictions.length} products</span>
                            ) : (
                              <span>Showing {startIndex + 1}-{Math.min(endIndex, filteredPredictions.length)} of {filteredPredictions.length} products</span>
                            )}
                          </div>
                        )}

                        {/* Products List */}
                        <div className="space-y-3">
                          {paginatedPredictions.map((suggestion, index) => {
                            const isRestock = suggestion.decision === "restock";
                            const priority = isRestock ? getPriorityBadge(suggestion.reorder_qty, suggestion.current_stock) : null;
                            
                            const decisionBadge = suggestion.decision === "ok" 
                              ? { label: "Adequate Stock", variant: "secondary" as const, color: "bg-muted/50 border-border" }
                              : suggestion.decision === "overstock"
                              ? { label: "Overstocked", variant: "outline" as const, color: "bg-yellow-500/5 border-yellow-500/20" }
                              : { label: "Restock Needed", variant: "destructive" as const, color: "bg-destructive/5 border-destructive/20" };
                            
                            return (
                              <div 
                                key={startIndex + index} 
                                className={`p-4 rounded-xl border ${decisionBadge.color} ${isRestock ? "ring-2 ring-destructive/20" : ""}`}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <h3 className="font-semibold">{(suggestion as any).product_name || suggestion.category}</h3>
                                    <p className="text-sm text-muted-foreground">
                                      SKU: {(suggestion as any).product_sku || "N/A"}
                                    </p>
                                      <p className="text-sm text-muted-foreground">
                                        Current Stock: {formatNumber(suggestion.current_stock)} units
                                      </p>
                                    {isRestock && (
                                      <p className="text-xs text-destructive mt-1 font-medium">
                                        ⚠️ Low stock! Predicted demand exceeds current inventory
                                      </p>
                                    )}
                                  </div>
                                  <Badge variant={isRestock && priority ? priority.variant : decisionBadge.variant}>
                                    {isRestock && priority ? priority.label : decisionBadge.label}
                                  </Badge>
                                </div>
                                <div className="mt-3 space-y-1 text-sm">
                                      <p>
                                        <span className="font-medium">Predicted sales (next week):</span>{" "}
                                        {formatNumber(suggestion.pred_next_week_units, 0)} units
                                      </p>
                                  {isRestock && (
                                    <>
                                      <p>
                                        <span className="font-medium">Safety stock:</span> {formatNumber(suggestion.safety_stock_estimate)} units
                                      </p>
                                      <p className="font-medium text-destructive">
                                        Suggested reorder quantity: {formatNumber(suggestion.reorder_qty)} units
                                      </p>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Pagination Controls */}
                        {filteredPredictions.length > itemsPerPage && (
                          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4">
                            <div className="text-sm text-muted-foreground">
                              Page {currentPage} of {totalPages}
                            </div>
                            <div className="flex justify-center items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="gap-1"
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                              </Button>
                              <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                  let pageNum;
                                  if (totalPages <= 5) {
                                    pageNum = i + 1;
                                  } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                  } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                  } else {
                                    pageNum = currentPage - 2 + i;
                                  }
                                  return (
                                    <Button
                                      key={pageNum}
                                      variant={currentPage === pageNum ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => setCurrentPage(pageNum)}
                                      className="min-w-[40px]"
                                    >
                                      {pageNum}
                                    </Button>
                                  );
                                })}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage >= totalPages}
                                className="gap-1"
                              >
                                Next
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Inventory Value
                </CardTitle>
                <CardDescription>Total value of current stock at cost price</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-4xl font-bold text-primary mb-2">{formatCurrency(performanceData.inventoryValue)}</p>
                  <p className="text-sm text-muted-foreground">Total inventory value</p>
                  <Button
                    onClick={fetchPerformanceData}
                    variant="ghost"
                    size="sm"
                    className="mt-4"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Stock-to-Sales Ratio
                </CardTitle>
                <CardDescription>Inventory value relative to sales</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-4xl font-bold text-primary mb-2">
                    {performanceData.stockToSalesRatio > 0 
                      ? performanceData.stockToSalesRatio.toFixed(2)
                      : "N/A"}
                  </p>
                  <p className="text-sm text-muted-foreground">Last 30 days</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {performanceData.stockToSalesRatio > 0 
                      ? performanceData.stockToSalesRatio > 2 
                        ? "High inventory relative to sales"
                        : performanceData.stockToSalesRatio > 1
                        ? "Moderate inventory levels"
                        : "Low inventory levels"
                      : "Insufficient sales data"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Days of Supply</CardTitle>
              <CardDescription>Estimated days until stock depletion based on current sales velocity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-4xl font-bold text-primary mb-2">
                  {performanceData.daysOfSupply > 0 
                    ? Math.round(performanceData.daysOfSupply)
                    : "N/A"}
                  {performanceData.daysOfSupply > 0 && <span className="text-lg text-muted-foreground ml-2">days</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {performanceData.daysOfSupply > 0 
                    ? "Based on last 30 days sales average"
                    : "Requires sales data to calculate"}
                </p>
                {performanceData.daysOfSupply > 0 && (
                  <div className="mt-4 max-w-md mx-auto">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={
                        performanceData.daysOfSupply < 30 
                          ? "destructive" 
                          : performanceData.daysOfSupply < 60
                          ? "default"
                          : "secondary"
                      }>
                        {performanceData.daysOfSupply < 30 
                          ? "Critical" 
                          : performanceData.daysOfSupply < 60
                          ? "Low"
                          : "Adequate"}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analytics;
