import {
  register,
  MediaRecorder as ExtendableMediaRecorder,
  IMediaRecorder,
} from "extendable-media-recorder";
import { ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { connect } from "extendable-media-recorder-wav-encoder";

export interface IVideoStorage {
  /** Sets blob properties. This will be called only before the first call of storeChunk() after construction or reset(). */
  setBlobProperties(blobProperties: BlobPropertyBag): void;

  /** Handle recorded video chunk. */
  storeChunk(chunk: Blob): void;

  /** Informs this storage that the last chunk has been provided. */
  stop(): void;

  /** Gets the URL where the video is stored. */
  getUrl(): string | null;

  /** If this storage stores all chunks in a merged Blob, returns it; otherwise returns undefined.*/
  getBlob(): Blob | undefined;
}

export type ReactMediaRecorderRenderProps = {
  error: string;
  muteAudio: () => void;
  unMuteAudio: () => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  stopStream: () => void;
  getMediaStream: () => void;
  mediaBlobUrl: undefined | string;
  status: StatusMessages;
  isAudioMuted: boolean;
  previewStream: MediaStream | null;
  previewAudioStream: MediaStream | null;
  clearBlobUrl: () => void;
};

export type ReactMediaRecorderHookProps = {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
  screen?: boolean;
  onStop?: (blobUrl: string | undefined, blob: Blob | undefined) => void;
  onStart?: () => void;
  blobPropertyBag?: BlobPropertyBag;
  mediaRecorderOptions?: MediaRecorderOptions | undefined;
  customMediaStream?: MediaStream | null;
  stopStreamsOnStop?: boolean;
  askPermissionOnMount?: boolean;
  videoStorageFactory?: () => IVideoStorage;
  timeslice?: number;
};
export type ReactMediaRecorderProps = ReactMediaRecorderHookProps & {
  render: (props: ReactMediaRecorderRenderProps) => ReactElement;
};

export type StatusMessages =
  | "media_aborted"
  | "permission_denied"
  | "no_specified_media_found"
  | "media_in_use"
  | "invalid_media_constraints"
  | "no_constraints"
  | "recorder_error"
  | "idle"
  | "acquiring_media"
  | "delayed_start"
  | "recording"
  | "stopping"
  | "stopped"
  | "paused";

export enum RecorderErrors {
  AbortError = "media_aborted",
  NotAllowedError = "permission_denied",
  NotFoundError = "no_specified_media_found",
  NotReadableError = "media_in_use",
  OverconstrainedError = "invalid_media_constraints",
  TypeError = "no_constraints",
  NONE = "",
  NO_RECORDER = "recorder_error",
}

export class ObjectUrlStorage implements IVideoStorage {
  blobProperties: any;
  url: string | null = null;
  blob: Blob = new Blob();
  mediaChunks: Blob[] = [];

  setBlobProperties(blobProperties: BlobPropertyBag): void {
    this.blobProperties = blobProperties;
  }
  storeChunk(chunk: Blob) {
    this.mediaChunks.push(chunk);
  }
  stop() {
    let blob = new Blob(this.mediaChunks, this.blobProperties);
    let url = URL.createObjectURL(blob);
    this.blob = blob;
    this.url = url;
  }
  getUrl(): string | null {
    return this.url;
  }
  getBlob(): Blob | undefined {
    return this.blob;
  }
}

export function useReactMediaRecorder({
  audio = true,
  video = false,
  onStop = () => null,
  onStart = () => null,
  blobPropertyBag,
  screen = false,
  mediaRecorderOptions = undefined,
  customMediaStream = null,
  stopStreamsOnStop = true,
  askPermissionOnMount = false,
  videoStorageFactory = () => new ObjectUrlStorage(),
  timeslice = undefined,
}: ReactMediaRecorderHookProps): ReactMediaRecorderRenderProps {
  const mediaRecorder = useRef<IMediaRecorder | null>(null);
  const videoStorage = useRef<IVideoStorage | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<StatusMessages>("idle");
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | undefined>(
    undefined
  );
  const [error, setError] = useState<keyof typeof RecorderErrors>("NONE");

  useEffect(() => {
    const setup = async () => {
      await register(await connect());
    };
    setup();
  }, []);

  let blobPropertiesSet = false;

  const getMediaStream = useCallback(async () => {
    setStatus("acquiring_media");
    const requiredMedia: MediaStreamConstraints = {
      audio: typeof audio === "boolean" ? !!audio : audio,
      video: typeof video === "boolean" ? !!video : video,
    };
    let stream: MediaStream | null = null;
    try {
      if (customMediaStream) {
        stream = customMediaStream;
      } else if (screen) {
        stream = (await window.navigator.mediaDevices.getDisplayMedia({
          video: video || true,
        })) as MediaStream;
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          stopRecording();
        });
        if (audio) {
          const audioStream = await window.navigator.mediaDevices.getUserMedia({
            audio,
          });

          audioStream
            .getAudioTracks()
            .forEach((audioTrack) => stream?.addTrack(audioTrack));
        }
        mediaStream.current = stream;
      } else {
        stream = await window.navigator.mediaDevices.getUserMedia(
          requiredMedia
        );
      }
      setStatus("idle");
    } catch (error: any) {
      setError(error.name);
      setStatus("idle");
    } finally {
      mediaStream.current = stream;
    }
  }, [audio, video, screen]);

  useEffect(() => {

    if (!window.MediaRecorder) {
      throw new Error("Unsupported Browser");
    }

    if (screen) {
      if (!window.navigator.mediaDevices.getDisplayMedia) {
        throw new Error("This browser doesn't support screen capturing");
      }
    }

    const checkConstraints = (mediaType: MediaTrackConstraints) => {
      const supportedMediaConstraints =
        navigator.mediaDevices.getSupportedConstraints();
      const unSupportedConstraints = Object.keys(mediaType).filter(
        (constraint) =>
          !(supportedMediaConstraints as { [key: string]: any })[constraint]
      );

      if (unSupportedConstraints.length > 0) {
        console.error(
          `The constraints ${unSupportedConstraints.join(
            ","
          )} doesn't support on this browser. Please check your ReactMediaRecorder component.`
        );
      }
    };

    if (typeof audio === "object") {
      checkConstraints(audio);
    }
    if (typeof video === "object") {
      checkConstraints(video);
    }

    if (mediaRecorderOptions && mediaRecorderOptions.mimeType) {
      if (!MediaRecorder.isTypeSupported(mediaRecorderOptions.mimeType)) {
        console.error(
          `The specified MIME type you supplied for MediaRecorder doesn't support this browser`
        );
      }
    }

    if (!mediaStream.current && askPermissionOnMount) {
      getMediaStream();
    }

    return () => {
      if (mediaStream.current) {
        const tracks = mediaStream.current.getTracks();
        tracks.forEach((track) => track.clone().stop());
      }
    };
  }, [
    audio,
    screen,
    video,
    getMediaStream,
    mediaRecorderOptions,
    askPermissionOnMount,
  ]);

  // Media Recorder Handlers

  const startRecording = async () => {
    setError("NONE");
    if (!mediaStream.current) {
      await getMediaStream();
    }
    if (mediaStream.current) {
      const isStreamEnded = mediaStream.current
        .getTracks()
        .some((track) => track.readyState === "ended");
      if (isStreamEnded) {
        await getMediaStream();
      }

      // User blocked the permissions (getMediaStream errored out)
      if (!mediaStream.current.active) {
        return;
      }

      // Initialise new storage
      videoStorage.current = videoStorageFactory();
      blobPropertiesSet = false;

      mediaRecorder.current = new ExtendableMediaRecorder(
        mediaStream.current,
        mediaRecorderOptions || undefined
      );
      mediaRecorder.current.ondataavailable = onRecordingActive;
      mediaRecorder.current.onstop = onRecordingStop;
      mediaRecorder.current.onstart = onRecordingStart;
      mediaRecorder.current.onerror = () => {
        setError("NO_RECORDER");
        setStatus("idle");
      };
      mediaRecorder.current.start(timeslice);
      setStatus("recording");
    }
  };

  const onRecordingActive = ({ data }: BlobEvent) => {
    if (!blobPropertiesSet) {
      const blobProperties: BlobPropertyBag = Object.assign(
        { type: data.type },
        blobPropertyBag ||
          (video ? { type: "video/mp4" } : { type: "audio/wav" })
      );

      videoStorage.current?.setBlobProperties(blobProperties);
      blobPropertiesSet = true;
    }

    videoStorage.current?.storeChunk(data);
  };

  const onRecordingStart = () => {
    onStart();
  };

  const onRecordingStop = () => {
    videoStorage.current?.stop();
    const url = videoStorage.current?.getUrl() ?? undefined;
    setStatus("stopped");
    setMediaBlobUrl(url);
    onStop(url, videoStorage.current?.getBlob());
  };

  const muteAudio = (mute: boolean) => {
    setIsAudioMuted(mute);
    if (mediaStream.current) {
      mediaStream.current
        .getAudioTracks()
        .forEach((audioTrack) => (audioTrack.enabled = !mute));
    }
  };

  const pauseRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      setStatus("paused");
      mediaRecorder.current.pause();
    }
  };
  const resumeRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "paused") {
      setStatus("recording");
      mediaRecorder.current.resume();
    }
  };

  const stopStream = () => {
    if (mediaStream.current) {
      const tracks = mediaStream.current.getTracks();
      tracks.forEach((track) => track.stop());
    }
  };

  const stopRecording = async () => {
    if (mediaRecorder.current) {
      if (mediaRecorder.current.state !== "inactive") {
        setStatus("stopping");
        mediaRecorder.current.stop();
      }
    }
    if (stopStreamsOnStop) {
      stopStream();
    }
  };

  return {
    error: RecorderErrors[error],
    muteAudio: () => muteAudio(true),
    unMuteAudio: () => muteAudio(false),
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    stopStream,
    getMediaStream,
    mediaBlobUrl,
    status,
    isAudioMuted,
    previewStream: mediaStream.current
      ? new MediaStream(mediaStream.current.getVideoTracks())
      : null,
    previewAudioStream: mediaStream.current
      ? new MediaStream(mediaStream.current.getAudioTracks())
      : null,
    clearBlobUrl: () => {
      if (mediaBlobUrl) {
        URL.revokeObjectURL(mediaBlobUrl);
      }
      setMediaBlobUrl(undefined);
      setStatus("idle");
    },
  };
}

export const ReactMediaRecorder = (props: ReactMediaRecorderProps) =>
  props.render(useReactMediaRecorder(props));
