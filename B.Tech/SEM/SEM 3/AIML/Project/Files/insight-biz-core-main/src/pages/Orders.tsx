import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingBag, Receipt, Calendar, Package, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Printer, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber } from "@/lib/utils";

const Orders = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      // Fetch completed/fulfilled orders with order items
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching orders:", error);
        return;
      }

      // Fetch order items for each order
      if (ordersData && ordersData.length > 0) {
        const orderIds = ordersData.map(order => order.id);
        const { data: orderItemsData } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", orderIds);

        // Attach items to their respective orders
        const ordersWithItems = ordersData.map(order => ({
          ...order,
          items: orderItemsData?.filter(item => item.order_id === order.id) || []
        }));

        setOrders(ordersWithItems);
        setAllOrders(ordersWithItems);
      } else {
        setOrders([]);
        setAllOrders([]);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter orders based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setOrders(allOrders);
      setCurrentPage(1);
      return;
    }

    const filtered = allOrders.filter((order) => {
      const searchLower = searchTerm.toLowerCase();
      const orderNumber = order.order_number?.toString().toLowerCase() || "";
      const orderDate = new Date(order.created_at).toLocaleDateString().toLowerCase();
      const total = order.total?.toString().toLowerCase() || "";
      
      // Search in order items
      const itemsMatch = order.items?.some((item: any) => 
        item.product_name?.toLowerCase().includes(searchLower)
      ) || false;

      return (
        orderNumber.includes(searchLower) ||
        orderDate.includes(searchLower) ||
        total.includes(searchLower) ||
        itemsMatch
      );
    });

    setOrders(filtered);
    setCurrentPage(1);
  }, [searchTerm, allOrders]);

  const handleViewDetails = (order: any) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    );
  }

  // Calculate pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = orders.slice(startIndex, endIndex);
  const totalPages = Math.ceil(orders.length / itemsPerPage);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">Orders</h1>
        <p className="text-muted-foreground">View all fulfilled/completed orders</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            <ShoppingBag className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(orders.length)}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <span className="text-xl font-bold text-muted-foreground">₹</span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatCurrency(orders.reduce((sum, order) => sum + Number(order.total), 0))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">From all orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Items Sold</CardTitle>
            <Package className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatNumber(orders.reduce((sum, order) => 
                sum + (order.items?.reduce((itemSum: number, item: any) => itemSum + item.quantity, 0) || 0), 
                0
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total units sold</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle>Fulfilled Orders</CardTitle>
              <CardDescription>All completed orders with their details</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search Input */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by order number, date, amount, or product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setSearchTerm("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Items per page:</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(parseInt(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {searchTerm && (
              <div className="text-sm text-muted-foreground">
                Found {orders.length} order{orders.length !== 1 ? "s" : ""} matching "{searchTerm}"
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">
                {searchTerm ? "No orders found" : "No orders found"}
              </p>
              <p className="text-sm">
                {searchTerm 
                  ? `No orders match your search "${searchTerm}". Try a different search term.`
                  : "You don't have any completed orders yet"}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Receipt className="h-5 w-5 text-muted-foreground" />
                          <h3 className="font-semibold text-lg">Order #{order.order_number}</h3>
                          <Badge variant="default" className="bg-green-600 text-white">
                            Completed
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-muted-foreground mt-2">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(order.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            <span>{formatNumber(order.items?.length || 0)} items</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4" />
                            <span>{formatNumber(order.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0)} units</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">₹</span>
                            <span className="font-semibold text-foreground">{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => handleViewDetails(order)}
                        className="gap-2"
                      >
                        <Receipt className="h-4 w-4" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {orders.length > itemsPerPage && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 mt-6 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1}-{Math.min(endIndex, orders.length)} of {orders.length} orders
                  </div>
                  <div className="flex items-center gap-2">
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
          )}
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Order Receipt</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="mx-auto bg-primary rounded-2xl w-16 h-16 flex items-center justify-center">
                  <ShoppingCart className="h-8 w-8 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold">FutureKart</h2>
                <p className="text-sm text-muted-foreground">Thank you for your order!</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Order Number:</span>
                  <span className="font-medium">#{selectedOrder.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bill Date:</span>
                  <span className="font-medium">{new Date(selectedOrder.created_at).toLocaleString()}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="font-semibold mb-2">Items:</div>
                {selectedOrder.items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.product_name} x{formatNumber(item.quantity)}</span>
                    <span>{formatCurrency(item.total_price)}</span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST (5%)</span>
                  <span>{formatCurrency(selectedOrder.tax)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Bill
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowOrderDetails(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;

