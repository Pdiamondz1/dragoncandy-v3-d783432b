
import React from 'react';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';

export const AuthHeader = () => {
  return (
    <div className="flex flex-col items-center mb-8">
      <img src={dragonCandyLogo} alt="DragonCandy" className="h-32 mb-4" />
      <span className="inline-block bg-pink-100 text-pink-600 rounded-full px-4 py-1 text-xs font-semibold shadow-sm animate-fade-in">
        🚀 AI-Powered Content Platform
      </span>
    </div>
  );
};
