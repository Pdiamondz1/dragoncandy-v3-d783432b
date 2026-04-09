import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Eye, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
interface AnonymousCampaignLayoutProps {
  children: React.ReactNode;
  currentStep?: number;
  totalSteps?: number;
}

export const AnonymousCampaignLayout: React.FC<AnonymousCampaignLayoutProps> = ({
  children,
  currentStep = 1,
  totalSteps = 5,
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background relative">
      {/* Main content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-card/95 backdrop-blur-sm border-b border-border sticky top-0 z-20 rounded-b-2xl shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/landing')}
                  className="flex items-center gap-2 hover:bg-card/80 rounded-xl transition-all duration-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Landing
                </Button>
                <div className="h-6 w-px bg-muted" />
                <h1 className="text-xl font-semibold text-foreground">
                  Campaign Wizard
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="flex items-center gap-2 rounded-xl">
                  <Eye className="h-3 w-3" />
                  Preview Mode
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Step {currentStep} of {totalSteps}
                </span>
              </div>
            </div>
          </div>
          
          {/* Info Banner */}
          <Alert className="mx-6 my-4 bg-blue-50/90 backdrop-blur-sm border-blue-200 rounded-2xl shadow-sm">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm text-blue-800">
              <strong>Business clients only:</strong> Campaign publishing requires a business account. 
              Content creators can browse and apply to campaigns instead.
            </AlertDescription>
          </Alert>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 max-w-full overflow-x-hidden">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-card/95 backdrop-blur-sm border-t border-border mt-12 rounded-t-2xl shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center text-sm text-muted-foreground">
              <p>
                Your campaign progress is saved locally. 
                <span className="font-medium"> Sign up to publish and manage your campaigns.</span>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};