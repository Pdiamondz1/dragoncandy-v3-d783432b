import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Turtle, Zap, Flame, Clock, ArrowRight, Check } from 'lucide-react';
import { DeliveryType } from './DeliveryTypeSelector';

interface DeliveryTierOption {
  type: DeliveryType;
  icon: React.ReactNode;
  label: string;
  timeframe: string;
  fee: string;
  feeAmount: number;
  features: string[];
  isPremium?: boolean;
}

const deliveryTierOptions: DeliveryTierOption[] = [
  {
    type: 'standard',
    icon: <Turtle className="h-8 w-8" />,
    label: 'Standard',
    timeframe: '72 hours',
    fee: 'No extra fee',
    feeAmount: 0,
    features: ['Standard support', 'Regular matching', 'Quality guaranteed'],
  },
  {
    type: 'expedited',
    icon: <Zap className="h-8 w-8" />,
    label: 'Expedited',
    timeframe: '8–12 hours',
    fee: '+ $25 rush fee',
    feeAmount: 25,
    features: ['Priority matching', 'Faster review', 'Dedicated queue'],
  },
  {
    type: 'dragonrush',
    icon: <Flame className="h-8 w-8" />,
    label: 'DragonRush',
    timeframe: '1–3 hours',
    fee: '+ $75 premium fee',
    feeAmount: 75,
    features: ['Top priority', 'Dedicated support', 'Guaranteed delivery', 'Fixed price only'],
    isPremium: true,
  },
];

interface DeliveryTierStepProps {
  initialTier?: DeliveryType;
  onContinue: (tier: DeliveryType, fee: number) => void;
}

const DeliveryTierStep: React.FC<DeliveryTierStepProps> = ({
  initialTier = 'standard',
  onContinue,
}) => {
  const [selectedTier, setSelectedTier] = useState<DeliveryType>(initialTier);

  const handleContinue = () => {
    const selected = deliveryTierOptions.find(opt => opt.type === selectedTier);
    onContinue(selectedTier, selected?.feeAmount || 0);
  };

  return (
    <div className="space-y-6 overflow-hidden">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-semibold">
              0
            </div>
            Choose Your Delivery Speed
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            How fast do you need content delivered? Select a tier to get started.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Delivery Tier Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {deliveryTierOptions.map((option) => (
              <Card
                key={option.type}
                onClick={() => setSelectedTier(option.type)}
                className={cn(
                  "relative cursor-pointer transition-all hover:shadow-lg",
                  selectedTier === option.type
                    ? "ring-2 ring-primary border-primary bg-primary/5"
                    : "hover:border-primary/50"
                )}
              >
                {/* Premium Badge */}
                {option.isPremium && (
                  <div className="absolute top-2 right-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded-full font-medium z-10">
                    Premium
                  </div>
                )}

                <CardContent className="pt-6 pb-4">
                  <div className="flex flex-col items-center text-center space-y-4">
                    {/* Icon */}
                    <div className={cn(
                      "p-4 rounded-full",
                      option.type === 'standard' && "bg-green-100 text-green-600",
                      option.type === 'expedited' && "bg-yellow-100 text-yellow-600",
                      option.type === 'dragonrush' && "bg-gradient-to-r from-orange-100 to-pink-100 text-orange-600"
                    )}>
                      {option.icon}
                    </div>

                    {/* Label & Timeframe */}
                    <div>
                      <h3 className="font-semibold text-lg text-foreground">{option.label}</h3>
                      <p className="text-primary font-medium">{option.timeframe}</p>
                    </div>

                    {/* Fee Badge */}
                    <div className={cn(
                      "text-sm font-medium px-3 py-1.5 rounded-full",
                      option.feeAmount === 0
                        ? "bg-green-100 text-green-700"
                        : "bg-orange-100 text-orange-700"
                    )}>
                      {option.fee}
                    </div>

                    {/* Features List */}
                    <ul className="space-y-2 text-sm text-muted-foreground text-left w-full">
                      {option.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Timer Rule */}
          <div className="flex items-center justify-center gap-2 p-4 bg-muted/50 rounded-lg">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Timer starts when creator taps <span className="font-medium text-foreground">"Start Capture"</span>
            </p>
          </div>

          {/* Continue Button */}
          <div className="flex justify-end">
            <Button onClick={handleContinue} size="lg" className="w-full sm:w-auto">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeliveryTierStep;
