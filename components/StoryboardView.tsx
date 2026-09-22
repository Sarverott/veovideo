/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import {AspectRatio, Chapter, ImageFile, Resolution, VeoModel} from '../types';
import {ArrowPathIcon, ArrowRightIcon, FilmIcon, SparklesIcon} from './icons';

interface StoryboardViewProps {
  chapters: Chapter[];
  referenceImages: ImageFile[];
  onGenerateChapter: (
    chapterId: string,
    prompt: string,
    model: VeoModel,
    aspectRatio: AspectRatio,
    resolution: Resolution,
    startFrame?: ImageFile,
  ) => void;
  onGenerateAllSequential: () => void;
  onNewStoryboard: () => void;
}

const StoryboardView: React.FC<StoryboardViewProps> = ({
  chapters,
  referenceImages,
  onGenerateChapter,
  onGenerateAllSequential,
  onNewStoryboard,
}) => {
  const isAnyGenerating = chapters.some((c) => c.status === 'loading');

  return (
    <div className="w-full flex flex-col gap-6 p-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-200">Video Storyboard</h2>
          <p className="text-sm text-gray-400 mt-1">
            {chapters.length} scenes ready to film
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onGenerateAllSequential}
            disabled={isAnyGenerating}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20">
            <SparklesIcon className="w-4 h-4" />
            Generate Movie (Sequential)
          </button>
          <button
            onClick={onNewStoryboard}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm text-white rounded-lg transition-colors">
            New Story
          </button>
        </div>
      </div>

      {referenceImages.length > 0 && (
        <div className="bg-[#2c2c2e] p-4 rounded-xl border border-gray-700 mb-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Character References
          </h3>
          <div className="flex flex-wrap gap-3">
            {referenceImages.map((img, i) => (
              <div
                key={i}
                className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-600 group">
                <img
                  src={URL.createObjectURL(img.file)}
                  alt="Reference"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            className={`bg-gray-800/50 border rounded-xl overflow-hidden flex flex-col shadow-lg transition-all ${
              chapter.status === 'loading'
                ? 'border-indigo-500/50 ring-1 ring-indigo-500/20'
                : 'border-gray-700'
            }`}>
            <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between items-center">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                Scene {index + 1}
              </span>
              <div className="flex items-center gap-2">
                {chapter.status === 'loading' && (
                  <span className="text-xs text-yellow-400 animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                    Generating...
                  </span>
                )}
                {chapter.status === 'success' && (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                    Completed
                  </span>
                )}
                {chapter.status === 'error' && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                    Failed
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 flex-grow">
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                {chapter.prompt}
              </p>

              {chapter.videoUrl ? (
                <div className="rounded-lg overflow-hidden bg-black aspect-video relative group">
                  <video
                    src={chapter.videoUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-gray-900/30 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-700">
                  <FilmIcon className="w-8 h-8 text-gray-600 opacity-50" />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-700 bg-gray-900/30">
              {chapter.status === 'loading' ? (
                <button
                  disabled
                  className="w-full py-2 bg-gray-700 text-gray-400 rounded-lg font-medium cursor-wait opacity-75">
                  Processing...
                </button>
              ) : chapter.videoUrl ? (
                <div className="flex gap-2">
                  <a
                    href={chapter.videoUrl}
                    download={`scene-${index + 1}.mp4`}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-center font-medium text-sm transition-colors">
                    Download
                  </a>
                  <button
                    onClick={() =>
                      onGenerateChapter(
                        chapter.id,
                        chapter.prompt,
                        referenceImages.length > 0
                          ? VeoModel.VEO
                          : VeoModel.VEO_FAST,
                        AspectRatio.LANDSCAPE,
                        Resolution.P720,
                      )
                    }
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                    title="Regenerate">
                    <ArrowPathIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  disabled={isAnyGenerating}
                  onClick={() =>
                    onGenerateChapter(
                      chapter.id,
                      chapter.prompt,
                      referenceImages.length > 0
                        ? VeoModel.VEO
                        : VeoModel.VEO_FAST,
                      AspectRatio.LANDSCAPE,
                      Resolution.P720,
                    )
                  }
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed">
                  Generate Scene <ArrowRightIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StoryboardView;
