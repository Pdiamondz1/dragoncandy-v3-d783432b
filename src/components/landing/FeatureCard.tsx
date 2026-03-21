
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <div className="group bg-white border border-gray-100 rounded-2xl p-4 md:p-6 lg:p-8 flex flex-col items-center text-center gap-2 lg:gap-3 hover:border-dc-teal/40 hover:shadow-card-hover transition-all duration-300 cursor-default">
      <div className="mb-1 lg:mb-2 p-3 rounded-xl bg-dc-teal/10 group-hover:bg-dc-teal/15 group-hover:scale-110 transition-all duration-300">
        {icon}
      </div>
      <h3 className="text-sm md:text-base lg:text-lg font-bold text-[#111111]">{title}</h3>
      <p className="text-xs md:text-sm lg:text-base text-[#555555] leading-relaxed">{description}</p>
    </div>
  );
};
