
import React from 'react';
import logo from '@/assets/dragon-candy-logo.png';

export const CreatorProfileSetupHeader = () => {
  return (
    <>
      <img src={logo} alt="DragonCandy" className="h-16 w-auto mx-auto mb-4" />
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        Complete Your Creator Profile
      </h1>
      <p className="text-gray-600">
        Showcase your skills and start getting discovered by brands
      </p>
    </>
  );
};
