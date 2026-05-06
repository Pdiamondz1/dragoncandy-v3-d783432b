
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.webp';

export const CreatorProfileSetupHeader = () => {
  return (
    <>
      <div className="mx-auto mb-6 flex items-center justify-center">
        <img src={dragonCandyLogo} alt="DragonCandy" className="h-32" />
      </div>
      <h2 className="text-3xl font-bold text-gray-900 mb-2">
        Complete Your Creator Profile
      </h2>
      <p className="text-gray-600">
        Showcase your skills and start getting discovered by brands
      </p>
    </>
  );
};
