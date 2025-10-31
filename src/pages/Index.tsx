import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  useEffect(() => {
    // Redirect based on user role
    if (userRole === 'admin' || userRole === 'master') {
      navigate('/users', { replace: true });
    } else if (userRole === 'reseller') {
      navigate('/profile', { replace: true }); // Updated redirect to /profile
    }
  }, [userRole, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  );
}