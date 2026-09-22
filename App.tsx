/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {Video} from '@google/genai';
import React, {useCallback, useEffect, useState} from 'react';
import ApiKeyDialog from './components/ApiKeyDialog';
import {CurvedArrowDownIcon} from './components/icons';
import LoadingIndicator from './components/LoadingIndicator';
import PromptForm from './components/PromptForm';
import StoryboardView from './components/StoryboardView';
import VideoResult from './components/VideoResult';
import {createStoryboard, generateVideo} from './services/geminiService';
import {
  AppState,
  AspectRatio,
  Chapter,
  GenerateVideoParams,
  GenerationMode,
  ImageFile,
  Resolution,
  VeoModel,
  VideoFile,
} from './types';

const extractLastFrame = async (videoBlob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;
    // We need to wait for metadata to know duration
    video.onloadedmetadata = () => {
      // Seek to very end (minus small buffer to ensure frame exists)
      video.currentTime = Math.max(0, video.duration - 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.split(',')[1]); // Return base64 without prefix
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(video.src);
      }
    };

    video.onerror = (e) => reject(new Error('Video loading failed'));
  });
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastConfig, setLastConfig] = useState<GenerateVideoParams | null>(
    null,
  );
  const [lastVideoObject, setLastVideoObject] = useState<Video | null>(null);
  const [lastVideoBlob, setLastVideoBlob] = useState<Blob | null>(null);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);

  // Storyboard state
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [storyboardReferences, setStoryboardReferences] = useState<ImageFile[]>(
    [],
  );

  // A single state to hold the initial values for the prompt form
  const [initialFormValues, setInitialFormValues] =
    useState<GenerateVideoParams | null>(null);

  // Check for API key on initial load
  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        try {
          if (!(await window.aistudio.hasSelectedApiKey())) {
            setShowApiKeyDialog(true);
          }
        } catch (error) {
          console.warn(
            'aistudio.hasSelectedApiKey check failed, assuming no key selected.',
            error,
          );
          setShowApiKeyDialog(true);
        }
      }
    };
    checkApiKey();
  }, []);

  const showStatusError = (message: string) => {
    setErrorMessage(message);
    setAppState(AppState.ERROR);
  };

  const ensureApiKey = async (): Promise<boolean> => {
    if (window.aistudio) {
      try {
        if (!(await window.aistudio.hasSelectedApiKey())) {
          setShowApiKeyDialog(true);
          return false;
        }
      } catch (error) {
        setShowApiKeyDialog(true);
        return false;
      }
    }
    return true;
  };

  const handleGenerate = useCallback(async (params: GenerateVideoParams) => {
    if (!(await ensureApiKey())) return;

    // Handle Storyboard Mode
    if (params.mode === GenerationMode.STORYBOARD) {
      setAppState(AppState.LOADING);
      setErrorMessage(null);
      // Store reference images to be used in chapters
      if (params.referenceImages) {
        setStoryboardReferences(params.referenceImages);
      } else {
        setStoryboardReferences([]);
      }

      try {
        const prompts = await createStoryboard(params.prompt);
        const newChapters: Chapter[] = prompts.map((p, i) => ({
          id: `chapter-${Date.now()}-${i}`,
          prompt: p,
          status: 'idle',
        }));
        setChapters(newChapters);
        setAppState(AppState.STORYBOARD_VIEW);
      } catch (error) {
        console.error('Storyboard generation failed:', error);
        setErrorMessage(
          'Failed to create storyboard. Please check the API key or try a shorter prompt.',
        );
        setAppState(AppState.ERROR);
      }
      return;
    }

    // Normal Video Generation Flow
    setAppState(AppState.LOADING);
    setErrorMessage(null);
    setLastConfig(params);
    // Reset initial form values for the next fresh start
    setInitialFormValues(null);

    try {
      const {objectUrl, blob, video} = await generateVideo(params);
      setVideoUrl(objectUrl);
      setLastVideoBlob(blob);
      setLastVideoObject(video);
      setAppState(AppState.SUCCESS);
    } catch (error) {
      handleGenerationError(error);
    }
  }, []);

  const handleGenerateChapter = async (
    chapterId: string,
    prompt: string,
    model: VeoModel,
    aspectRatio: AspectRatio,
    resolution: Resolution,
    startFrame?: ImageFile,
  ) => {
    if (!(await ensureApiKey())) return;

    setChapters((prev) =>
      prev.map((c) => (c.id === chapterId ? {...c, status: 'loading'} : c)),
    );

    try {
      const {objectUrl, blob, video} = await generateVideo({
        prompt,
        model,
        aspectRatio,
        resolution,
        mode: GenerationMode.TEXT_TO_VIDEO,
        referenceImages: storyboardReferences, // Pass global references
        startFrame: startFrame, // Pass specific start frame (from prev scene)
      });

      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                status: 'success',
                videoUrl: objectUrl,
                blob,
                videoObject: video,
              }
            : c,
        ),
      );
      return blob;
    } catch (error) {
      console.error(`Failed to generate chapter ${chapterId}`, error);
      setChapters((prev) =>
        prev.map((c) => (c.id === chapterId ? {...c, status: 'error'} : c)),
      );
      throw error;
    }
  };

  const handleGenerateSequential = async () => {
    if (!(await ensureApiKey())) return;

    // Find the first non-completed chapter or start from beginning
    // For simplicity, we can just iterate all and skip completed, or strictly do all.
    // Let's iterate all to ensure chain continuity.

    let previousBlob: Blob | undefined = undefined;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      // If we already have a blob for this chapter, use it for next iteration but don't regenerate
      // UNLESS we want to force regeneration. The user asked to "chain... launched each after another".
      // Assuming they want to generate the whole sequence.
      // However, to save money/time, if it's already success, we might want to skip?
      // But if it's success, did it use the correct previous frame? Maybe not.
      // Safest is to generate if status is not success. But for chain, we need the blob.

      let startFrame: ImageFile | undefined = undefined;

      if (i > 0 && previousBlob) {
        try {
          const base64 = await extractLastFrame(previousBlob);
          startFrame = {
            file: new File([], 'prev_frame.png', {type: 'image/png'}),
            base64: base64,
          };
          console.log(`Extracted last frame from scene ${i}, passing to ${i + 1}`);
        } catch (e) {
          console.warn('Failed to extract last frame, proceeding without continuity for this step', e);
        }
      }

      // If chapter is already done and we have a blob, update previousBlob and continue
      if (chapter.status === 'success' && chapter.blob) {
         previousBlob = chapter.blob;
         continue;
      }

      try {
        // We use VEO (Generate Preview) if we have references or need better continuity with start frame + refs
        const modelToUse = (storyboardReferences.length > 0 || startFrame) ? VeoModel.VEO : VeoModel.VEO_FAST;
        
        previousBlob = await handleGenerateChapter(
          chapter.id,
          chapter.prompt,
          modelToUse,
          AspectRatio.LANDSCAPE,
          Resolution.P720,
          startFrame
        );
      } catch (e) {
        // Stop chain on error
        break;
      }
    }
  };

  const handleGenerationError = (error: any) => {
    console.error('Video generation failed:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred.';

    let userFriendlyMessage = `Video generation failed: ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          'Model not found. This can be caused by an invalid API key or permission issues. Please check your API key.';
        shouldOpenDialog = true;
      } else if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.toLowerCase().includes('permission denied')
      ) {
        userFriendlyMessage =
          'Your API key is invalid or lacks permissions. Please select a valid, billing-enabled API key.';
        shouldOpenDialog = true;
      }
    }

    setErrorMessage(userFriendlyMessage);
    setAppState(AppState.ERROR);

    if (shouldOpenDialog) {
      setShowApiKeyDialog(true);
    }
  };

  const handleRetry = useCallback(() => {
    if (lastConfig) {
      handleGenerate(lastConfig);
    }
  }, [lastConfig, handleGenerate]);

  const handleApiKeyDialogContinue = async () => {
    setShowApiKeyDialog(false);
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
    }
    if (appState === AppState.ERROR && lastConfig) {
      handleRetry();
    }
  };

  const handleNewVideo = useCallback(() => {
    setAppState(AppState.IDLE);
    setVideoUrl(null);
    setErrorMessage(null);
    setLastConfig(null);
    setLastVideoObject(null);
    setLastVideoBlob(null);
    setInitialFormValues(null);
    setChapters([]);
    setStoryboardReferences([]);
  }, []);

  const handleTryAgainFromError = useCallback(() => {
    if (lastConfig) {
      setInitialFormValues(lastConfig);
      setAppState(AppState.IDLE);
      setErrorMessage(null);
    } else {
      handleNewVideo();
    }
  }, [lastConfig, handleNewVideo]);

  const handleExtend = useCallback(async () => {
    if (lastConfig && lastVideoBlob && lastVideoObject) {
      try {
        const file = new File([lastVideoBlob], 'last_video.mp4', {
          type: lastVideoBlob.type,
        });
        const videoFile: VideoFile = {file, base64: ''};

        setInitialFormValues({
          ...lastConfig,
          mode: GenerationMode.EXTEND_VIDEO,
          prompt: '',
          inputVideo: videoFile,
          inputVideoObject: lastVideoObject,
          resolution: Resolution.P720,
          startFrame: null,
          endFrame: null,
          referenceImages: [],
          styleImage: null,
          isLooping: false,
        });

        setAppState(AppState.IDLE);
        setVideoUrl(null);
        setErrorMessage(null);
      } catch (error) {
        console.error('Failed to process video for extension:', error);
        const message =
          error instanceof Error ? error.message : 'An unknown error occurred.';
        showStatusError(`Failed to prepare video for extension: ${message}`);
      }
    }
  }, [lastConfig, lastVideoBlob, lastVideoObject]);

  const renderError = (message: string) => (
    <div className="text-center bg-red-900/20 border border-red-500 p-8 rounded-lg">
      <h2 className="text-2xl font-bold text-red-400 mb-4">Error</h2>
      <p className="text-red-300">{message}</p>
      <button
        onClick={handleTryAgainFromError}
        className="mt-6 px-6 py-2 bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
        Try Again
      </button>
    </div>
  );

  return (
    <div className="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
      {showApiKeyDialog && (
        <ApiKeyDialog onContinue={handleApiKeyDialogContinue} />
      )}
      <header className="py-6 flex justify-center items-center px-8 relative z-10">
        <h1 className="text-5xl font-semibold tracking-wide text-center bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
          Veo Studio
        </h1>
      </header>
      <main className="w-full max-w-5xl mx-auto flex-grow flex flex-col p-4 overflow-y-auto">
        {appState === AppState.IDLE ? (
          <>
            <div className="flex-grow flex items-center justify-center min-h-[300px]">
              <div className="relative text-center">
                <h2 className="text-3xl text-gray-600">
                  Type in the prompt box to start
                </h2>
                <CurvedArrowDownIcon className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-24 h-24 text-gray-700 opacity-60" />
              </div>
            </div>
            <div className="pb-4">
              <PromptForm
                onGenerate={handleGenerate}
                initialValues={initialFormValues}
              />
            </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col items-center w-full">
            {appState === AppState.LOADING && <LoadingIndicator />}

            {appState === AppState.SUCCESS && videoUrl && (
              <VideoResult
                videoUrl={videoUrl}
                onRetry={handleRetry}
                onNewVideo={handleNewVideo}
                onExtend={handleExtend}
                canExtend={lastConfig?.resolution === Resolution.P720}
              />
            )}

            {appState === AppState.STORYBOARD_VIEW && (
              <StoryboardView
                chapters={chapters}
                referenceImages={storyboardReferences}
                onGenerateChapter={handleGenerateChapter}
                onGenerateAllSequential={handleGenerateSequential}
                onNewStoryboard={handleNewVideo}
              />
            )}

            {appState === AppState.SUCCESS &&
              !videoUrl &&
              renderError(
                'Video generated, but URL is missing. Please try again.',
              )}
            {appState === AppState.ERROR &&
              errorMessage &&
              renderError(errorMessage)}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
