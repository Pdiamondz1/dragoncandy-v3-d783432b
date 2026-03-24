import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { DollarSign, TrendingUp, Sparkles } from 'lucide-react';

export type PricingType = 'fixed' | 'bid_range';

interface PricingTypeSelectorProps {
  value: PricingType;
  onChange: (type: PricingType) => void;
  fixedPrice: number;
  onFixedPriceChange: (price: number) => void;
  budgetMin: number;
  budgetMax: number;
  onBudgetMinChange: (value: number) => void;
  onBudgetMaxChange: (value: number) => void;
  deliveryFee: number;
  forceFixed?: boolean;
  aiRecommendedPrice?: number;
}

const PricingTypeSelector: React.FC<PricingTypeSelectorProps> = ({
  value,
  onChange,
  fixedPrice,
  onFixedPriceChange,
  budgetMin,
  budgetMax,
  onBudgetMinChange,
  onBudgetMaxChange,
  deliveryFee,
  forceFixed = false,
  aiRecommendedPrice = 500,
}) => {
  const effectiveValue = forceFixed ? 'fixed' : value;

  const handleTypeChange = (type: PricingType) => {
    if (!forceFixed) {
      onChange(type);
    }
  };

  const useAiRecommendation = () => {
    onFixedPriceChange(aiRecommendedPrice);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-base font-semibold text-foreground">
          Pricing Model
        </label>
        <p className="text-sm text-muted-foreground">
          {forceFixed 
            ? "DragonRush requires a fixed price (no bidding)" 
            : "Choose how you want to set the creator payout"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fixed Price Option */}
        <Card
          onClick={() => handleTypeChange('fixed')}
          className={cn(
            "cursor-pointer p-4 transition-all",
            effectiveValue === 'fixed'
              ? "ring-2 ring-primary border-primary bg-primary/5"
              : forceFixed 
                ? "opacity-100" 
                : "hover:border-primary/50",
            forceFixed && effectiveValue !== 'fixed' && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground">Fixed Price</h4>
              <p className="text-sm text-muted-foreground">
                Set an exact payout amount. Creator applies directly at this price.
              </p>
            </div>
          </div>
        </Card>

        {/* Bid Range Option */}
        <Card
          onClick={() => handleTypeChange('bid_range')}
          className={cn(
            "cursor-pointer p-4 transition-all",
            effectiveValue === 'bid_range'
              ? "ring-2 ring-primary border-primary bg-primary/5"
              : "hover:border-primary/50",
            forceFixed && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-secondary/50 text-secondary-foreground">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground">Bid Range</h4>
              <p className="text-sm text-muted-foreground">
                Set a budget range. Creators submit bids within your range.
              </p>
              {forceFixed && (
                <p className="text-xs text-destructive mt-1">
                  Not available for DragonRush
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Pricing Input Fields */}
      <Card className="p-4 bg-muted/30">
        {effectiveValue === 'fixed' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-base font-semibold">Creator Payout</Label>
              <button
                type="button"
                onClick={useAiRecommendation}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors shrink-0"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                Use AI Recommended (${aiRecommendedPrice})
              </button>
            </div>
            
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                min="50"
                step="25"
                value={fixedPrice}
                onChange={(e) => onFixedPriceChange(Number(e.target.value))}
                className="pl-9 text-lg font-semibold"
                placeholder="Enter payout amount"
              />
            </div>

            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="text-muted-foreground">Creator Payout</span>
                <span>${fixedPrice}</span>
              </div>
            )}
            
            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rush Fee</span>
                <span className="text-orange-600">+${deliveryFee}</span>
              </div>
            )}
            
            <div className="flex justify-between text-base font-semibold pt-2 border-t">
              <span>Total Campaign Cost</span>
              <span className="text-primary">${fixedPrice + deliveryFee}</span>
            </div>
            
            <p className="text-xs text-muted-foreground">
              This amount will be held in escrow when you publish the campaign.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Label className="text-base font-semibold">Budget Range</Label>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Minimum ($)</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="100"
                    step="50"
                    value={budgetMin}
                    onChange={(e) => onBudgetMinChange(Number(e.target.value))}
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div>
                <Label className="text-sm text-muted-foreground">Maximum ($)</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="100"
                    step="50"
                    value={budgetMax}
                    onChange={(e) => onBudgetMaxChange(Number(e.target.value))}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Escrow payment will be charged after you accept a creator's bid.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PricingTypeSelector;
