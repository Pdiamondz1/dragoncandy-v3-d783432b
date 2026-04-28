import { QRCodeSVG } from 'qrcode.react';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.webp';

export function DesktopGate() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-dc-pink-bg to-dc-teal flex items-center justify-center p-8">
      <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-10 text-center max-w-sm w-full shadow-2xl">
        <img
          src={dragonCandyLogo}
          alt="DragonCandy"
          className="h-12 mx-auto mb-5"
        />
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
          Better on your phone 📱
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          The full DragonCandy experience is designed for mobile. Grab your phone!
        </p>
        <div className="flex justify-center mb-5">
          <div className="p-2 rounded-2xl ring-4 ring-dc-pink-accent bg-white shadow-md inline-block">
            <QRCodeSVG
              value="https://dragoncandy.io"
              size={128}
              fgColor="#111111"
              bgColor="#ffffff"
            />
          </div>
        </div>
        <div className="bg-dc-pink-accent text-white rounded-full px-6 py-2.5 text-sm font-bold inline-block mb-3">
          Scan to open on phone
        </div>
        <p className="text-xs text-gray-400">dragoncandy.io</p>
      </div>
    </div>
  );
}
