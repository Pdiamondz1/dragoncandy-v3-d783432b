
import React from 'react';
import { Sparkles } from 'lucide-react';

export const CreatorProfileSetupHeader = () => {
  return (
    <>
      <div className="rounded-full bg-pink-100 p-3 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
        <Sparkles className="text-pink-600 w-8 h-8" />
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        Complete Your Creator Profile
      </h1>
      <p className="text-gray-600">
        Showcase your skills and start getting discovered by brands
      </p>
    </>
  );
};
