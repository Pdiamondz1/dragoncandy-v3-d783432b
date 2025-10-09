
import React from 'react';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';

export const CreatorProfileSetupHeader = () => {
  return (
    <>
      <div className="mx-auto mb-4 flex items-center justify-center">
        <img src={dragonCandyLogo} alt="DragonCandy" className="h-24" />
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
