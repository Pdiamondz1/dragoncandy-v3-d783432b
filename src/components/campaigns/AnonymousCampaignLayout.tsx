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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/landing')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Landing
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-xl font-semibold text-gray-900">
                Campaign Wizard
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="flex items-center gap-2">
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
        <Alert className="mx-6 my-4 bg-blue-50 border-blue-200">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-blue-800">
            <strong>Business clients only:</strong> Campaign publishing requires a business account. 
            Content creators can browse and apply to campaigns instead.
          </AlertDescription>
        </Alert>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
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
  );
};