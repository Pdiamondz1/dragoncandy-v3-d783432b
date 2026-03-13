
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <div className="bg-white border-2 border-dc-teal rounded-2xl p-4 flex flex-col items-center text-center gap-2">
      <div className="mb-1">{icon}</div>
      <h3 className="text-base font-bold text-[#111111]">{title}</h3>
      <p className="text-sm text-[#555555] leading-relaxed">{description}</p>
    </div>
  );
};
