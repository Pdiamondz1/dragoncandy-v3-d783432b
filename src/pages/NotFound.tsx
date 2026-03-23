import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

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
    <div className="bg-dc-gray min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-extrabold text-dc-teal">404</h1>
        <p className="text-xl font-bold text-white">Page not found</p>
        <p className="text-sm text-white/70">The page you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate('/')}
          className="inline-block rounded-full bg-dc-teal text-white font-bold py-3 px-8 hover:bg-dc-teal/90 transition-colors"
        >
          Go Home
        </button>
      </div>
    </div>
  );
};

export default NotFound;
