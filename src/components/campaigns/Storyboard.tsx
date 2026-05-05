import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { StoryboardFrame } from '@/types/campaignMedia';

interface StoryboardProps {
  frames: StoryboardFrame[];
  title?: string;
}

export const Storyboard: React.FC<StoryboardProps> = ({ frames, title = 'Storyboard' }) => {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {frames.length === 0 ? (
          <p className="text-sm text-gray-500">No frames available.</p>
        ) : (
          <div className="space-y-3">
            {frames.map((frame, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-800">
                  <span className="font-bold">Frame {frame.frame_number}:</span>{' '}
                  {frame.scene_description}
                </p>

                {/* Pill badges for camera angle and duration */}
                {(frame.camera_angle || frame.duration_seconds !== undefined) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {frame.camera_angle && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                        {frame.camera_angle}
                      </span>
                    )}
                    {frame.duration_seconds !== undefined && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                        {frame.duration_seconds}s
                      </span>
                    )}
                  </div>
                )}

                {/* Text overlay and transition */}
                {(frame.text_overlay || frame.transition) && (
                  <div className="mt-2 space-y-0.5">
                    {frame.text_overlay && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Text overlay:</span> {frame.text_overlay}
                      </p>
                    )}
                    {frame.transition && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Transition:</span> {frame.transition}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

