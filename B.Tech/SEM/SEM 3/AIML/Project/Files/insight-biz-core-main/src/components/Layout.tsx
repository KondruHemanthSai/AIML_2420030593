import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, Receipt, Brain, Settings, LogOut, Moon, Sun, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useTheme } from "next-themes";
import Chatbot from "./Chatbot";
interface LayoutProps {
  children: ReactNode;
}
const Layout = ({
  children
}: LayoutProps) => {
  const navigate = useNavigate();
  const {
    theme,
    setTheme
  } = useTheme();
  const handleLogout = async () => {
    const {
      error
    } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error logging out");
    } else {
      toast.success("Logged out successfully");
      navigate("/auth");
    }
  };
  const navItems = [{
    to: "/",
    icon: LayoutDashboard,
    label: "Dashboard"
  }, {
    to: "/inventory",
    icon: Package,
    label: "Inventory"
  }, {
    to: "/billing",
    icon: Receipt,
    label: "Billing"
  }, {
    to: "/orders",
    icon: ShoppingBag,
    label: "Orders"
  }, {
    to: "/analytics",
    icon: Brain,
    label: "AI & Analytics"
  }];
  return <div className="flex min-h-screen w-full">
      {/* Fixed Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50 max-lg:w-0 max-lg:overflow-hidden">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="bg-primary rounded-xl w-10 h-10 flex items-center justify-center overflow-hidden">
              <img 
                src="/logo.png" 
                alt="FutureKart Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  // Fallback to text if image fails to load
                  const target = e.target as HTMLImageElement;
                  if (target.parentElement) {
                    target.style.display = "none";
                    target.parentElement.innerHTML = '<span class="text-lg font-bold text-primary-foreground">₹</span>';
                  }
                }}
              />
            </div>
            <div>
              <h1 className="font-bold text-lg text-sidebar-foreground">FutureKart</h1>
              <p className="text-xs text-muted-foreground">Business Management</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(item => <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({
          isActive
        }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-soft" : "text-sidebar-foreground hover:bg-sidebar-accent/50"}`}>
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>)}
        </nav>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-sidebar-border space-y-1">
          <NavLink to="/settings" className={({
          isActive
        }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/50"}`}>
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </NavLink>
          
          <Button variant="ghost" className="w-full justify-start gap-3 px-4 py-3 h-auto text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </Button>

          <Button variant="ghost" className="w-full justify-start gap-3 px-4 py-3 h-auto text-destructive hover:bg-destructive/10" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </Button>
        </div>
      </aside>

      {/* Main Content - with left margin to account for fixed sidebar */}
      <main className="flex-1 ml-64 max-lg:ml-0 overflow-auto">
        {children}
      </main>

      {/* Chatbot - Available on all pages */}
      <Chatbot />
    </div>;
};
export default Layout;