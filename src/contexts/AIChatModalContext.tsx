import React, { createContext, useContext, useState, useCallback } from 'react';

interface AIChatModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const AIChatModalContext = createContext<AIChatModalContextType | undefined>(undefined);

export const useAIChatModal = () => {
  const context = useContext(AIChatModalContext);
  // Return no-op functions if used outside provider (e.g., on auth pages)
  if (!context) {
    return {
      isOpen: false,
      openModal: () => {},
      closeModal: () => {},
    };
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
