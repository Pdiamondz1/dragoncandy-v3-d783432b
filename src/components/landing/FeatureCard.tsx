
import { Card, CardContent } from "@/components/ui/card";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <Card className="text-center p-8 border-0 rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 bg-white">
      <CardContent className="pt-8">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-pink-50 rounded-2xl transition-transform duration-300 hover:scale-110">
            {icon}
          </div>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          {title}
        </h3>
        <p className="text-gray-600 leading-relaxed text-base">
          {description}
        </p>
      </CardContent>
    </Card>
  );
};
