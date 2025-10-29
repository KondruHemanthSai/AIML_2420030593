import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Package, TrendingUp, AlertCircle, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    completedOrders: 0,
    activeSKUs: 0,
  });
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [categoryStockData, setCategoryStockData] = useState<any[]>([]);
  const [revenueTrendData, setRevenueTrendData] = useState<any[]>([]);
  const [orderTrendData, setOrderTrendData] = useState<any[]>([]);
  const [topSellingProducts, setTopSellingProducts] = useState<any[]>([]);
  const [categoryRevenueData, setCategoryRevenueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch revenue (completed orders this month)
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data: revenueData } = await supabase
        .from("orders")
        .select("total")
        .eq("status", "completed")
        .gte("created_at", startOfMonth);
      
      const totalRevenue = revenueData?.reduce((sum, order) => sum + Number(order.total), 0) || 0;

      // Fetch order counts
      const { data: completedData } = await supabase
        .from("orders")
        .select("id", { count: "exact" })
        .eq("status", "completed")
        .gte("created_at", startOfMonth);

      // Fetch product count
      const { data: productsData } = await supabase
        .from("products")
        .select("id", { count: "exact" });

      // Fetch all products with category info (used for both low stock check and pie chart)
      // Note: We fetch all and filter client-side because Supabase doesn't support column-to-column comparison in filters
      const { data: allProductsData } = await supabase
        .from("products")
        .select("*, categories(name)");
      
      // Filter low stock products client-side where stock_quantity <= low_stock_threshold
      const lowStockData = allProductsData
        ?.filter((product: any) => 
          Number(product.stock_quantity || 0) <= Number(product.low_stock_threshold || 0)
        )
        .sort((a: any, b: any) => Number(a.stock_quantity || 0) - Number(b.stock_quantity || 0))
        .slice(0, 10) || [];

      // Use the same data for category stock chart
      const productsWithCategories = allProductsData;

      // Fetch orders for revenue trend (last 7 days)
      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);
      const { data: ordersTrendData } = await supabase
        .from("orders")
        .select("total, created_at, status")
        .eq("status", "completed")
        .gte("created_at", last7Days.toISOString())
        .order("created_at", { ascending: true });

      // Process category stock data for pie chart
      if (productsWithCategories) {
        const categoryMap: Record<string, number> = {};
        productsWithCategories.forEach((product: any) => {
          const categoryName = product.categories?.name || "Uncategorized";
          categoryMap[categoryName] = (categoryMap[categoryName] || 0) + (product.stock_quantity || 0);
        });
        
        const categoryData = Object.entries(categoryMap).map(([name, value]) => ({
          name,
          value,
        }));
        setCategoryStockData(categoryData);
      }

      // Process revenue trend data (daily for last 7 days)
      if (ordersTrendData) {
        const dailyRevenue: Record<string, number> = {};
        ordersTrendData.forEach((order: any) => {
          const date = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(order.total);
        });
        
        const revenueTrend = Object.entries(dailyRevenue).map(([date, revenue]) => ({
          date,
          revenue: Number(revenue.toFixed(2)),
        }));
        setRevenueTrendData(revenueTrend);
      }

      // Process order trend data (last 7 days)
      if (ordersTrendData) {
        const dailyOrders: Record<string, number> = {};
        ordersTrendData.forEach((order: any) => {
          const date = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dailyOrders[date] = (dailyOrders[date] || 0) + 1;
        });
        
        const orderTrend = Object.entries(dailyOrders).map(([date, count]) => ({
          date,
          orders: count,
        }));
        setOrderTrendData(orderTrend);
      }

      // Fetch top selling products (from order_items, last 30 days)
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);
      const { data: orderItemsData } = await supabase
        .from("order_items")
        .select("product_name, quantity, total_price")
        .gte("created_at", last30Days.toISOString());

      if (orderItemsData) {
        const productSales: Record<string, { quantity: number; revenue: number }> = {};
        orderItemsData.forEach((item: any) => {
          const name = item.product_name;
          if (!productSales[name]) {
            productSales[name] = { quantity: 0, revenue: 0 };
          }
          productSales[name].quantity += item.quantity;
          productSales[name].revenue += Number(item.total_price);
        });

        const topProducts = Object.entries(productSales)
          .map(([name, data]) => ({
            name: name.length > 20 ? name.substring(0, 20) + "..." : name,
            quantity: data.quantity,
            revenue: Number(data.revenue.toFixed(2)),
          }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);
        
        setTopSellingProducts(topProducts);
      }

      // Fetch category revenue data (last 30 days)
      if (orderItemsData) {
        const { data: productsForCategories } = await supabase
          .from("products")
          .select("name, categories(name)");

        if (productsForCategories) {
          const categoryRevenue: Record<string, number> = {};
          orderItemsData.forEach((item: any) => {
            const product = productsForCategories.find((p: any) => p.name === item.product_name);
            const categoryName = product?.categories?.name || "Uncategorized";
            categoryRevenue[categoryName] = (categoryRevenue[categoryName] || 0) + Number(item.total_price);
          });

          const categoryRevData = Object.entries(categoryRevenue)
            .map(([name, revenue]) => ({
              name,
              revenue: Number(revenue.toFixed(2)),
            }))
            .sort((a, b) => b.revenue - a.revenue);
          
          setCategoryRevenueData(categoryRevData);
        }
      }

      setStats({
        totalRevenue,
        completedOrders: completedData?.length || 0,
        activeSKUs: productsData?.length || 0,
      });

      setLowStockProducts(lowStockData || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, subtitle, color }: any) => (
    <Card className="shadow-soft hover:shadow-medium transition-smooth">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-xl ${color} flex items-center justify-center`}>
          {typeof Icon === 'function' ? <Icon /> : <Icon className="h-5 w-5 text-white" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's your business overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={() => (
            <img src="/logo.png" alt="FutureKart Logo" className="w-6 h-6 object-contain" />
          )}
          subtitle="This month"
          color="bg-primary"
        />
        <StatCard
          title="Completed Orders"
          value={formatNumber(stats.completedOrders)}
          icon={Package}
          subtitle="This month"
          color="bg-success"
        />
        <StatCard
          title="Active SKUs"
          value={formatNumber(stats.activeSKUs)}
          icon={TrendingUp}
          subtitle="In inventory"
          color="bg-chart-3"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock by Category Pie Chart */}
        <Card className="shadow-medium">
          <CardHeader>
            <CardTitle>Stock Distribution by Category</CardTitle>
            <CardDescription>Total stock quantity across product categories</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryStockData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No category data available</p>
            ) : (
              <ChartContainer
                config={categoryStockData.reduce((acc, item, index) => {
                  const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
                  acc[item.name] = {
                    label: item.name,
                    color: colors[index % colors.length],
                  };
                  return acc;
                }, {} as Record<string, { label: string; color: string }>)}
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryStockData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryStockData.map((entry, index) => {
                        const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Revenue Trend Chart */}
        <Card className="shadow-medium">
          <CardHeader>
            <CardTitle>Revenue Trend (Last 7 Days)</CardTitle>
            <CardDescription>Daily revenue from completed orders</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueTrendData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No revenue data available</p>
            ) : (
              <ChartContainer
                config={{
                  revenue: {
                    label: "Revenue",
                    color: "hsl(var(--chart-1))",
                  },
                }}
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-1))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Trend Chart */}
      <Card className="shadow-medium">
        <CardHeader>
          <CardTitle>Order Trend (Last 7 Days)</CardTitle>
          <CardDescription>Number of completed orders per day</CardDescription>
        </CardHeader>
        <CardContent>
          {orderTrendData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No order data available</p>
          ) : (
            <ChartContainer
              config={{
                orders: {
                  label: "Orders",
                  color: "hsl(var(--chart-2))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar 
                    dataKey="orders" 
                    fill="hsl(var(--chart-2))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <Card className="shadow-medium">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Top Selling Products (Last 30 Days)
            </CardTitle>
            <CardDescription>Products ranked by quantity sold</CardDescription>
          </CardHeader>
          <CardContent>
            {topSellingProducts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No sales data available</p>
            ) : (
              <div className="space-y-4">
                {topSellingProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                          {formatNumber(product.quantity)} units sold
                      </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">{formatCurrency(product.revenue)}</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Revenue */}
        <Card className="shadow-medium">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Revenue by Category (Last 30 Days)
            </CardTitle>
            <CardDescription>Revenue breakdown across product categories</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryRevenueData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No revenue data available</p>
            ) : (
              <ChartContainer
                config={categoryRevenueData.reduce((acc, item, index) => {
                  const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
                  acc[item.name] = {
                    label: item.name,
                    color: colors[index % colors.length],
                  };
                  return acc;
                }, {} as Record<string, { label: string; color: string }>)}
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryRevenueData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar 
                      dataKey="revenue" 
                      fill="hsl(var(--chart-1))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Low Stock Alerts */}
        <Card className="shadow-medium border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Low Stock Alerts
              {lowStockProducts.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {lowStockProducts.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Products below their stock threshold - action required
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lowStockProducts.length === 0 ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-4">
                  <AlertCircle className="h-8 w-8 text-success" />
                </div>
                <p className="text-muted-foreground font-medium">All products well-stocked!</p>
                <p className="text-sm text-muted-foreground mt-1">No action needed at this time</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.map((product) => {
                  const stockPercentage = (product.stock_quantity / product.low_stock_threshold) * 100;
                  const isCritical = stockPercentage < 50;
                  
                  return (
                    <div 
                      key={product.id} 
                      className={`p-4 rounded-xl border ${
                        isCritical 
                          ? "bg-destructive/10 border-destructive/30" 
                          : "bg-destructive/5 border-destructive/20"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-semibold">{product.name}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            SKU: {product.sku}
                            {product.categories?.name && ` • Category: ${product.categories.name}`}
                          </p>
                        </div>
                        <Badge variant={isCritical ? "destructive" : "default"} className="ml-2">
                          {formatNumber(product.stock_quantity)} left
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Current Stock</span>
                          <span className="font-medium">{formatNumber(product.stock_quantity)} units</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Threshold</span>
                          <span className="font-medium">{formatNumber(product.low_stock_threshold)} units</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 mt-2">
                          <div
                            className={`h-2 rounded-full ${
                              isCritical ? "bg-destructive" : "bg-orange-500"
                            }`}
                            style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                          ></div>
                        </div>
                        {product.stock_quantity < product.low_stock_threshold && (
                          <p className="text-xs text-destructive font-medium mt-1">
                            Restock needed: {formatNumber(product.low_stock_threshold - product.stock_quantity)} units
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
};

export default Dashboard;
