import { useEffect, useState, useCallback } from 'react';
import { geocodingService } from '@/lib/geocoding';

interface UsePostalCodeAutoFillProps {
  postalCode: string;
  onCityChange: (city: string) => void;
  onCountryChange: (country: string) => void;
  debounceMs?: number;
}

export const usePostalCodeAutoFill = ({
  postalCode,
  onCityChange,
  onCountryChange,
  debounceMs = 500
}: UsePostalCodeAutoFillProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoFilled, setIsAutoFilled] = useState(false);

  const lookupPostalCode = useCallback(async (code: string) => {
    if (!code || code.length < 3) {
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await geocodingService.lookupPostalCode(code);
      
      if (result) {
        onCityChange(result.city);
        onCountryChange(result.country);
        setIsAutoFilled(true);
      } else {
        setError('Postal code not found');
        setIsAutoFilled(false);
      }
    } catch (err) {
      console.error('Postal code lookup error:', err);
      setError('Failed to lookup postal code');
      setIsAutoFilled(false);
    } finally {
      setIsLoading(false);
    }
  }, [onCityChange, onCountryChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (postalCode) {
        lookupPostalCode(postalCode);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [postalCode, debounceMs, lookupPostalCode]);

  const resetAutoFillFlag = useCallback(() => {
    setIsAutoFilled(false);
  }, []);

  return {
    isLoading,
    error,
    isAutoFilled,
    resetAutoFillFlag
  };
};
