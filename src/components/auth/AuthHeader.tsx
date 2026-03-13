
import React from 'react';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';

export const AuthHeader = () => {
  return (
    <div className="flex flex-col items-center mb-6">
      <img src={dragonCandyLogo} alt="DragonCandy" className="h-24 mb-3" />
    </div>
  );
};
