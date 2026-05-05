import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MoodBoardProps {
  title?: string;
  colorPalette: string[];
  typography?: { heading: string; body: string };
  layoutDescription: string;
  referenceDescriptions?: string[];
}

const MoodBoard: React.FC<MoodBoardProps> = ({
  title = 'Campaign Visual Guide',
  colorPalette,
  typography,
  layoutDescription,
  referenceDescriptions,
}) => {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Color Palette */}
        {colorPalette.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Color Palette</p>
            <div className="flex flex-wrap gap-2">
              {colorPalette.map((hex, index) => (
                <div
                  key={index}
                  title={hex}
                  className="w-8 h-8 rounded-full border border-gray-200 shadow-sm flex-shrink-0"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {colorPalette.map((hex, index) => (
                <span key={index} className="text-xs text-gray-500" style={{ minWidth: '2rem' }}>
                  {hex}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Typography */}
        {typography && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Typography</p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Heading:</span> {typography.heading}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Body:</span> {typography.body}
            </p>
          </div>
        )}

        {/* Layout Description */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">Layout</p>
          <p className="text-sm text-gray-600">{layoutDescription}</p>
        </div>

        {/* Reference Descriptions */}
        {referenceDescriptions && referenceDescriptions.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">References</p>
            <ul className="list-disc list-inside space-y-1">
              {referenceDescriptions.map((desc, index) => (
                <li key={index} className="text-sm text-gray-600">
                  {desc}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MoodBoard;
