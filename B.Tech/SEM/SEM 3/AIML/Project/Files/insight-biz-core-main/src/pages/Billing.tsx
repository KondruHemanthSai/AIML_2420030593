import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Plus, Minus, Trash2, ShoppingCart, Printer, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { tableNumberSchema } from "@/lib/validations/billing";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { sendOrderReceiptEmail } from "@/lib/email-service";
import { Label } from "@/components/ui/label";
const Billing = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [tableNumber, setTableNumber] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    // Get user's email if logged in
    getCurrentUserEmail();
  }, []);

  const getCurrentUserEmail = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setCustomerEmail(user.email);
      }
    } catch (error) {
      console.error("Error fetching user email:", error);
    }
  };
  const fetchProducts = async () => {
    const {
      data
    } = await supabase.from("products").select("*, categories(name)").order("name");
    setProducts(data || []);
  };
  const fetchCategories = async () => {
    const {
      data
    } = await supabase.from("categories").select("*").order("name");
    setCategories(data || []);
  };
  const addToCart = (product: any) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? {
        ...item,
        quantity: item.quantity + 1
      } : item));
    } else {
      setCart([...cart, {
        ...product,
        quantity: 1
      }]);
    }
  };
  const updateQuantity = (productId: string, change: number) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQuantity = item.quantity + change;
        return newQuantity > 0 ? {
          ...item,
          quantity: newQuantity
        } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };
  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
  };
  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
  };
  const calculateTax = (subtotal: number) => {
    return subtotal * 0.05; // 5% GST
  };
  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return subtotal + calculateTax(subtotal);
  };
  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    // Validate table number
    if (tableNumber) {
      const validation = tableNumberSchema.safeParse(tableNumber);
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }
    }

    // Validate cart quantities
    for (const item of cart) {
      if (item.quantity > item.stock_quantity) {
        toast.error(`Insufficient stock for ${item.name}. Available: ${item.stock_quantity}`);
        return;
      }
      if (item.quantity > 1000) {
        toast.error(`Quantity for ${item.name} cannot exceed 1000`);
        return;
      }
    }

    const subtotal = calculateSubtotal();
    const tax = calculateTax(subtotal);
    const total = calculateTotal();

    // Create order - user_id will be set automatically by trigger
    const {
      data: orderData,
      error: orderError
    } = await supabase.from("orders").insert({
      table_number: tableNumber || null,
      subtotal,
      tax,
      total,
      status: "completed",
      completed_at: new Date().toISOString()
    } as any).select().single();
    if (orderError) {
      toast.error("Error creating order");
      return;
    }

    // Create order items
    const orderItems = cart.map(item => ({
      order_id: orderData.id,
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.selling_price,
      total_price: item.selling_price * item.quantity
    }));
    const {
      error: itemsError
    } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) {
      toast.error("Error creating order items");
      return;
    }

    // Update stock quantities
    for (const item of cart) {
      await supabase.from("products").update({
        stock_quantity: item.stock_quantity - item.quantity
      }).eq("id", item.id);
    }
    setLastOrder({
      ...orderData,
      items: cart
    });
    setShowReceipt(true);
    setCart([]);
    setTableNumber("");
    toast.success("Order completed successfully!");

    // Send email receipt if email is provided
    if (customerEmail && customerEmail.trim()) {
      setSendingEmail(true);
      
      // Send email asynchronously (don't block order completion)
      sendOrderReceiptEmail(customerEmail, {
        orderNumber: orderData.order_number,
        billDate: new Date(orderData.created_at).toLocaleString(),
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.selling_price,
          total: item.selling_price * item.quantity
        })),
        subtotal,
        tax,
        total
      })
      .then((emailSent) => {
        if (emailSent) {
          toast.success(`Receipt sent to ${customerEmail}!`);
        } else {
          toast.warning("Order completed, but email could not be sent. Check email configuration.");
        }
      })
      .catch((error) => {
        console.error("Error sending email:", error);
        toast.warning("Order completed, but email could not be sent.");
      })
      .finally(() => {
        setSendingEmail(false);
      });
    } else {
      toast.info("No email provided. Receipt saved but not emailed.");
    }
  };
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  return <div className="p-8 h-screen flex flex-col">
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-foreground mb-2">Billing</h1>
        <p className="text-muted-foreground">Process sales and generate bills</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Products Section */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <Card className="shadow-medium flex-1 flex flex-col">
            <CardHeader className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search menu items..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant={selectedCategory === "all" ? "default" : "outline"} onClick={() => setSelectedCategory("all")} size="sm">
                  All
                </Button>
                {categories.map(cat => <Button key={cat.id} variant={selectedCategory === cat.id ? "default" : "outline"} onClick={() => setSelectedCategory(cat.id)} size="sm">
                    {cat.name}
                  </Button>)}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredProducts.map(product => <Card key={product.id} className="shadow-soft hover:shadow-medium transition-smooth cursor-pointer" onClick={() => addToCart(product)}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold">{product.name}</h3>
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                        </div>
                        <Badge variant={product.stock_quantity > 0 ? "default" : "destructive"} className="bg-success text-success-foreground">
                          {product.stock_quantity > 0 ? "Available" : "Out"}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-bold text-primary">{formatCurrency(product.selling_price, 0)}</span>
                        <Button size="sm" disabled={product.stock_quantity === 0}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cart Section */}
        <div className="flex flex-col min-h-0">
          <Card className="shadow-medium flex-1 flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Current Order
              </CardTitle>
              
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              {/* Email Input Section - Always visible */}
              <div className="mb-4 pb-4 border-b">
                <Label htmlFor="customerEmail" className="text-sm font-medium mb-2 block flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Customer Email (for receipt)
                </Label>
                <Input
                  id="customerEmail"
                  type="email"
                  placeholder="customer@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {customerEmail ? `Receipt will be sent to ${customerEmail}` : "Enter email address to receive receipt via email"}
                </p>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-auto mb-4">
                {cart.length === 0 ? <div className="flex items-center justify-center h-full text-muted-foreground">
                    Cart is empty
                  </div> : <div className="space-y-2">
                    {cart.map(item => <div key={item.id} className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
                        <div className="flex-1">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{formatCurrency(item.selling_price, 0)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" onClick={() => updateQuantity(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center font-medium">{formatNumber(item.quantity)}</span>
                          <Button size="icon" variant="outline" onClick={() => updateQuantity(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => removeFromCart(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>)}
                  </div>}
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(calculateSubtotal())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>GST (5%)</span>
                  <span>{formatCurrency(calculateTax(calculateSubtotal()))}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(calculateTotal())}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setCart([])} disabled={cart.length === 0}>
                    Clear Cart
                  </Button>
                  <Button 
                    className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90" 
                    onClick={handleCheckout} 
                    disabled={cart.length === 0 || sendingEmail}
                  >
                    {sendingEmail ? (
                      <>
                        <Mail className="h-4 w-4 mr-2 animate-pulse" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Proceed & Send Email
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Order Receipt</DialogTitle>
          </DialogHeader>
          {lastOrder && <div className="space-y-4">
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
                  <span className="font-medium">#{lastOrder.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bill Date:</span>
                  <span className="font-medium">{new Date(lastOrder.created_at).toLocaleString()}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="font-semibold mb-2">Items:</div>
                {lastOrder.items.map((item: any) => <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.name} x{formatNumber(item.quantity)}</span>
                    <span>{formatCurrency(item.selling_price * item.quantity)}</span>
                  </div>)}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(lastOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST (5%)</span>
                  <span>{formatCurrency(lastOrder.tax)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(lastOrder.total)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Bill
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowReceipt(false)}>
                  Close
                </Button>
              </div>
            </div>}
        </DialogContent>
      </Dialog>
    </div>;
};
export default Billing;