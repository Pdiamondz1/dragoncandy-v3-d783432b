
import React from 'react';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';

export const CreatorProfileSetupHeader = () => {
  return (
    <>
      <div className="mx-auto mb-6 flex items-center justify-center">
        <img src={dragonCandyLogo} alt="DragonCandy" className="h-32" />
      </div>
      <h1 className="text-3xl font-extrabold text-dc-teal uppercase mb-2">
        Complete Your Creator Profile
      </h1>
      <p className="text-[#555555]">
        Showcase your skills and start getting discovered by brands
      </p>
    </>
  );
};
