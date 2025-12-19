import React, { createContext, useContext, useState, useCallback } from 'react';

interface AIChatModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const AIChatModalContext = createContext<AIChatModalContextType | undefined>(undefined);

export const useAIChatModal = () => {
  const context = useContext(AIChatModalContext);
  if (!context) {
    throw new Error('useAIChatModal must be used within AIChatModalProvider');
  }
  return context;
};

export const AIChatModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  return (
    <AIChatModalContext.Provider value={{ isOpen, openModal, closeModal }}>
      {children}
    </AIChatModalContext.Provider>
  );
};
