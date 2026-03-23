
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 flex flex-col items-center text-center gap-2 cursor-default">
      <div className="mb-1 p-2 rounded-xl bg-dc-teal/10">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-[#111111] leading-tight">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
};
