import React from 'react';
import { Sparkles } from 'lucide-react';

export const BrandProfileSetupHeader = () => {
  return (
    <div className="text-center space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dc-teal mb-4">
        <Sparkles className="h-8 w-8 text-white" />
      </div>
      <h1 className="text-3xl font-bold">Welcome to DragonCandy</h1>
      <p className="text-muted-foreground max-w-2xl mx-auto">
        Set up your brand profile to start sponsoring campaigns, partnering with local creators, and amplifying your marketing reach.
      </p>
    </div>
  );
};
