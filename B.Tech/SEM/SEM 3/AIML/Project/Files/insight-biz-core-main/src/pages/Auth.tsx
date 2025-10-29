import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const Auth = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Video settings - you can replace this with your own video file
  // Place your video file in the public folder and update the path
  const videoSrc = "/auth-video.mp4"; // You can also use an external URL

  useEffect(() => {
    // Auto-play video and loop
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Auto-play might be blocked by browser, that's okay
      });
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Logged in successfully!");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: fullName,
            },
          },
        });
        if (error) throw error;
        toast.success("Account created! Please check your email to verify.");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Video Section */}
      <div className="hidden lg:flex lg:w-2/3 relative bg-gradient-to-br from-primary/20 to-primary/40 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          onError={() => {
            // Fallback if video fails to load - gradient background will show instead
            if (process.env.NODE_ENV === "development") {
              console.warn("Video failed to load, using fallback background");
            }
          }}
        >
          <source src={videoSrc} type="video/mp4" />
          {/* Fallback message if video doesn't load */}
          Your browser does not support the video tag.
        </video>
        {/* Overlay gradient for better text/logo visibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/60 via-primary/40 to-transparent z-10" />
        {/* Branding overlay (optional) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 text-white p-12">
          <div className="bg-primary/80 backdrop-blur-sm rounded-3xl w-24 h-24 flex items-center justify-center mb-6 shadow-2xl overflow-hidden p-2">
            <img 
              src="/logo.png" 
              alt="FutureKart Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.parentElement) {
                  target.style.display = "none";
                  target.parentElement.innerHTML = '<span class="text-4xl font-bold text-primary-foreground">₹</span>';
                }
              }}
            />
          </div>
          <h1 className="text-5xl font-bold mb-4 text-center drop-shadow-lg">FutureKart</h1>
          <p className="text-xl text-center max-w-md drop-shadow-md">
            AI-Powered Business Management Platform
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/3 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto bg-primary rounded-2xl w-16 h-16 flex items-center justify-center mb-4 overflow-hidden p-2">
              <img 
                src="/logo.png" 
                alt="FutureKart Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.parentElement) {
                    target.style.display = "none";
                    target.parentElement.innerHTML = '<span class="text-2xl font-bold text-primary-foreground">₹</span>';
                  }
                }}
              />
            </div>
            <CardTitle className="text-3xl">FutureKart</CardTitle>
            <CardDescription>
              {isLogin ? "Sign in to your account" : "Create a new account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline"
              >
                {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
