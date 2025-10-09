
import React from 'react';
import logo from '@/assets/dragon-candy-logo.png';

export const AuthHeader = () => {
  return (
    <div className="flex flex-col items-center mb-8">
      <img src={logo} alt="DragonCandy" className="h-16 w-auto mb-4" />
      <span className="inline-block bg-pink-100 text-pink-600 rounded-full px-4 py-1 text-xs font-semibold shadow-sm animate-fade-in">
        🚀 AI-Powered Content Platform
      </span>
    </div>
  );
};
