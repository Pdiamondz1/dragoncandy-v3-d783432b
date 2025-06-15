// Update this page (the content is just a fallback if you fail to update the page)
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to Your Blank App</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Start building your amazing project here!
        </p>
        <Button variant="default" onClick={() => navigate("/auth")}>
          Log in / Sign Up
        </Button>
      </div>
    </div>
  );
};

export default Index;
