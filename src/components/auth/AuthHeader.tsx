
import React from 'react';
import { Youtube } from 'lucide-react';

export const AuthHeader = () => {
  return (
    <div className="flex flex-col items-center mb-8">
      <div className="rounded-full bg-pink-100 p-3 mb-2">
        <Youtube className="text-pink-600 w-8 h-8" />
      </div>
      <span className="text-2xl font-extrabold text-pink-600 tracking-tight mb-2">
        DragonCandy
      </span>
      <span className="inline-block bg-pink-100 text-pink-600 rounded-full px-4 py-1 text-xs font-semibold shadow-sm animate-fade-in">
        🚀 AI-Powered Content Platform
      </span>
    </div>
  );
};
