import { useEffect, useMemo, useRef, useState } from "react";

import type { PresentedAttachment } from "../../lib/attachmentPresentation";
import { linkClass } from "../../design/forms";

const DRIFT_TOLERANCE_SECONDS = 0.075;

function formatDuration(durationSeconds: number): string {
  const totalSeconds = Math.round(durationSeconds);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const paddedSeconds = seconds.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`;
}

function trackDuration(
  attachment: PresentedAttachment,
  measuredDurations: ReadonlyMap<string, number>,
): number | null {
  const measured = measuredDurations.get(attachment.id);
  if (measured !== undefined && Number.isFinite(measured) && measured > 0) return measured;
  if (
    attachment.durationSeconds !== undefined &&
    attachment.durationSeconds !== null &&
    Number.isFinite(attachment.durationSeconds) &&
    attachment.durationSeconds > 0
  ) {
    return attachment.durationSeconds;
  }
  return null;
}

export function SynchronizedAudioPlayer({
  attachments,
}: {
  attachments: PresentedAttachment[];
}) {
  const playableAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.preview.available),
    [attachments],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(playableAttachments[0] ? [playableAttachments[0].id] : []),
  );
  const selectedIdsRef = useRef(selectedIds);
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const audioRefCallbacks = useRef(
    new Map<string, (element: HTMLAudioElement | null) => void>(),
  );
  const [measuredDurations, setMeasuredDurations] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const selectedAttachments = playableAttachments.filter((attachment) =>
    selectedIds.has(attachment.id),
  );
  const selectedDurations = selectedAttachments.flatMap((attachment) => {
    const duration = trackDuration(attachment, measuredDurations);
    return duration === null ? [] : [duration];
  });
  const sharedDuration =
    selectedDurations.length > 0 ? Math.min(...selectedDurations) : 0;
  const masterAttachment =
    selectedAttachments.find(
      (attachment) => trackDuration(attachment, measuredDurations) === sharedDuration,
    ) ?? selectedAttachments[0];

  function updateCurrentTime(nextTime: number) {
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
  }

  function updatePlaying(nextIsPlaying: boolean) {
    isPlayingRef.current = nextIsPlaying;
    setIsPlaying(nextIsPlaying);
  }

  function pause(ids: Iterable<string>) {
    for (const id of ids) audioElements.current.get(id)?.pause();
  }

  function audioRefFor(attachmentId: string) {
    const existing = audioRefCallbacks.current.get(attachmentId);
    if (existing) return existing;

    const callback = (element: HTMLAudioElement | null) => {
      if (element) {
        audioElements.current.set(attachmentId, element);
      } else {
        audioElements.current.get(attachmentId)?.pause();
        audioElements.current.delete(attachmentId);
      }
    };
    audioRefCallbacks.current.set(attachmentId, callback);
    return callback;
  }

  function seek(ids: Iterable<string>, nextTime: number) {
    for (const id of ids) {
      const audio = audioElements.current.get(id);
      if (!audio) continue;
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      audio.currentTime = duration === null ? nextTime : Math.min(nextTime, duration);
    }
  }

  async function play(ids: Iterable<string>) {
    const selectedAudio = [...ids].flatMap((id) => {
      const audio = audioElements.current.get(id);
      return audio ? [audio] : [];
    });
    const results = await Promise.allSettled(
      selectedAudio.map((audio) => Promise.resolve(audio.play())),
    );
    if (results.some((result) => result.status === "rejected")) {
      pause(selectedIdsRef.current);
      updatePlaying(false);
      setPlaybackError("The selected tracks could not all be played. Try selecting them again.");
      return false;
    }
    return true;
  }

  async function togglePlayback() {
    setPlaybackError(null);
    if (isPlayingRef.current) {
      pause(selectedIdsRef.current);
      updatePlaying(false);
      return;
    }

    let startTime = currentTimeRef.current;
    if (sharedDuration > 0 && startTime >= sharedDuration - DRIFT_TOLERANCE_SECONDS) {
      startTime = 0;
      updateCurrentTime(0);
    }
    seek(selectedIdsRef.current, startTime);
    updatePlaying(true);
    await play(selectedIdsRef.current);
  }

  function toggleTrack(attachmentId: string, checked: boolean) {
    setPlaybackError(null);
    const nextSelectedIds = new Set(selectedIdsRef.current);
    if (checked) {
      nextSelectedIds.add(attachmentId);
      const addedAttachment = playableAttachments.find(
        (attachment) => attachment.id === attachmentId,
      );
      const addedDuration = addedAttachment
        ? trackDuration(addedAttachment, measuredDurations)
        : null;
      if (
        addedDuration !== null &&
        currentTimeRef.current >= addedDuration - DRIFT_TOLERANCE_SECONDS
      ) {
        seek(nextSelectedIds, 0);
        updateCurrentTime(0);
      } else {
        seek([attachmentId], currentTimeRef.current);
      }
    } else {
      nextSelectedIds.delete(attachmentId);
      pause([attachmentId]);
    }
    selectedIdsRef.current = nextSelectedIds;
    setSelectedIds(nextSelectedIds);

    if (nextSelectedIds.size === 0) {
      pause(selectedIdsRef.current);
      updatePlaying(false);
    } else if (checked && isPlayingRef.current) {
      void play([attachmentId]);
    }
  }

  function seekGroup(nextTime: number) {
    const boundedTime = sharedDuration > 0 ? Math.min(nextTime, sharedDuration) : nextTime;
    seek(selectedIdsRef.current, boundedTime);
    updateCurrentTime(boundedTime);
  }

  function handleTimeUpdate(attachmentId: string) {
    if (attachmentId !== masterAttachment?.id) return;
    const master = audioElements.current.get(attachmentId);
    if (!master) return;

    const nextTime = master.currentTime;
    updateCurrentTime(nextTime);
    for (const selectedId of selectedIdsRef.current) {
      if (selectedId === attachmentId) continue;
      const audio = audioElements.current.get(selectedId);
      if (audio && Math.abs(audio.currentTime - nextTime) > DRIFT_TOLERANCE_SECONDS) {
        const duration = Number.isFinite(audio.duration) ? audio.duration : null;
        audio.currentTime = duration === null ? nextTime : Math.min(nextTime, duration);
      }
    }
  }

  function handleEnded(attachmentId: string) {
    if (attachmentId !== masterAttachment?.id) return;
    pause(selectedIdsRef.current);
    updatePlaying(false);
    updateCurrentTime(sharedDuration);
  }

  useEffect(() => {
    return () => pause(audioElements.current.keys());
  }, []);

  return (
    <section
      aria-labelledby="audio-tracks-heading"
      className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-950"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="audio-tracks-heading" className="font-semibold text-stone-900 dark:text-stone-100">
          Audio tracks
        </h2>
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {attachments.length}
        </span>
      </div>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        Select one or more tracks. The shared player keeps them in sync.
      </p>

      {attachments.length > 0 ? (
        <>
          <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void togglePlayback()}
                disabled={selectedIds.size === 0}
                className="min-w-16 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={isPlaying ? "Pause selected tracks" : "Play selected tracks"}
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <input
                type="range"
                min={0}
                max={sharedDuration || 0}
                step={0.1}
                value={sharedDuration > 0 ? Math.min(currentTime, sharedDuration) : 0}
                onChange={(event) => seekGroup(Number(event.currentTarget.value))}
                disabled={selectedIds.size === 0 || sharedDuration === 0}
                aria-label="Playback position"
                className="min-w-0 flex-1 accent-violet-600"
              />
              <span className="whitespace-nowrap text-xs tabular-nums text-stone-500 dark:text-stone-400">
                {formatDuration(currentTime)} / {formatDuration(sharedDuration)}
              </span>
            </div>
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              {selectedIds.size} selected
            </p>
            {playbackError && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">
                {playbackError}
              </p>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {attachments.map((attachment) => {
              const isAvailable = attachment.preview.available;
              const checkboxId = `audio-track-${attachment.id}`;
              return (
                <article
                  key={attachment.id}
                  className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900"
                >
                  <div className="flex items-start gap-3">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={selectedIds.has(attachment.id)}
                      disabled={!isAvailable}
                      onChange={(event) => toggleTrack(attachment.id, event.currentTarget.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
                    />
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={checkboxId}
                        className="block cursor-pointer text-sm font-medium text-stone-900 dark:text-stone-100"
                      >
                        {attachment.displayName}
                      </label>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                        {attachment.partLabel && <span>Parts: {attachment.partLabel}</span>}
                        {attachment.durationSeconds !== undefined &&
                          attachment.durationSeconds !== null && (
                            <span>Duration: {formatDuration(attachment.durationSeconds)}</span>
                          )}
                      </div>
                      {!isAvailable ? (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" role="status">
                          This file is currently unavailable.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs">
                          <a
                            href={attachment.download.url ?? undefined}
                            download={attachment.downloadName}
                            className={linkClass}
                          >
                            Download {attachment.downloadName}
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                  {isAvailable && (
                    <audio
                      ref={audioRefFor(attachment.id)}
                      src={attachment.preview.url ?? undefined}
                      preload="metadata"
                      hidden
                      data-testid={`audio-source-${attachment.id}`}
                      onLoadedMetadata={(event) => {
                        const duration = event.currentTarget.duration;
                        if (!Number.isFinite(duration) || duration <= 0) return;
                        setMeasuredDurations((current) => {
                          const next = new Map(current);
                          next.set(attachment.id, duration);
                          return next;
                        });
                      }}
                      onTimeUpdate={() => handleTimeUpdate(attachment.id)}
                      onEnded={() => handleEnded(attachment.id)}
                    >
                      Your browser does not support audio previews.
                    </audio>
                  )}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          No audio tracks for this selection.
        </p>
      )}
    </section>
  );
}
