import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { SEO } from "@/components/SEO";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="bg-white min-h-screen flex items-center justify-center p-4">
      <SEO
        title="Page Not Found"
        description="The page you're looking for doesn't exist."
        path="/404"
        noindex
      />
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-extrabold text-dc-teal">404</h1>
        <p className="text-xl font-bold text-gray-900">Page not found</p>
        <p className="text-sm text-gray-500">The page you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate('/')}
          className="inline-block rounded-full bg-dc-teal-btn text-white font-bold py-3 px-8 hover:bg-dc-teal-btn-hover transition-colors"
        >
          Go Home
        </button>
      </div>
    </div>
  );
};

export default NotFound;
