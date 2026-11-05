'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoRecorderProps {
  /** 上传/评估进行中时禁用录制操作。 */
  disabled?: boolean;
  /**
   * 当前题可回看的视频地址：本次录制的 blob URL，或服务端已保存的视频副本
   * （/api/interview/video?...）。为空表示该题尚未录制。
   */
  playbackSrc?: string | null;
  /** 录制结束且拿到有效视频数据时回调（页面据此自动上传并评估）。 */
  onRecorded: (blob: Blob) => void;
  /** 录制状态变化回调，供页面驱动状态机。 */
  onRecordingChange?: (recording: boolean) => void;
}

/**
 * 按优先级探测录制容器/编码：
 * 1. 显式声明音频 codec 的 MP4（H.264 + AAC）：既保留「MP4 优先、便于评估」的
 *    既有偏好，又保证封装的是音频编码；
 * 2. 显式声明 Opus 的 WebM：MP4+AAC 不可用时优先保证音频可被浏览器解码；
 * 3. 仅容器级声明的兜底（无 codec 参数）。
 *
 * 注意：裸 `video/mp4` 虽然被 Chromium 支持，但实测其 muxer 会把 Opus 封装进
 * MP4（已保存的录制文件里可见 Opus sample entry），部分播放器/评估链路无法解码
 * 该组合而表现为「没有声音」，因此不能作为首选。
 * 同时不再使用 `video/mp4;codecs=avc1` 这类只声明视频 codec 的候选，避免产出
 * 纯视频容器。
 * 部分录制环境产出的 WebM（VP9 + Opus、无时长元数据）在评价工作流中解析失败，
 * 因此仍保留「逐个探测、不假定某个浏览器支持某个容器」的既有策略。
 */
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/mp4',
  'video/webm',
];

const AUDIO_TRACK_WARNING =
  '本次录制未包含音频（未检测到麦克风），请检查麦克风权限或设备后重新录制。';

async function readPermissionState(
  name: 'camera' | 'microphone',
): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions.query({
      // DOM 类型里未声明 camera/microphone，运行时 Chromium 支持。
      name: name as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
}

/** 枚举输入设备，用于区分「没麦克风」与「没摄像头」。 */
async function readInputDevices(): Promise<{
  audio: boolean;
  video: boolean;
} | null> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audio: devices.some((device) => device.kind === 'audioinput'),
      video: devices.some((device) => device.kind === 'videoinput'),
    };
  } catch {
    return null;
  }
}

async function describeMediaError(error: unknown): Promise<string> {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError': {
      // 权限 API 可区分具体是哪个设备被拒；不可用时退回合并提示。
      const [microphone, camera] = await Promise.all([
        readPermissionState('microphone'),
        readPermissionState('camera'),
      ]);

      if (microphone === 'denied' && camera === 'denied') {
        return '摄像头与麦克风权限均被拒绝，请在浏览器设置中允许后重试';
      }
      if (microphone === 'denied') {
        return '麦克风权限被拒绝，请在浏览器设置中允许麦克风后重试';
      }
      if (camera === 'denied') {
        return '摄像头权限被拒绝，请在浏览器设置中允许摄像头后重试';
      }

      // 权限状态不可区分时，用设备枚举兜底：没有音频输入设备可明确提示麦克风。
      const devices = await readInputDevices();

      if (devices && !devices.audio && !devices.video) {
        return '未检测到可用的摄像头和麦克风';
      }
      if (devices && !devices.audio) {
        return '未检测到可用的麦克风（无音频输入设备），请连接麦克风后重试';
      }
      if (devices && !devices.video) {
        return '未检测到可用的摄像头，请连接摄像头后重试';
      }

      return '摄像头/麦克风权限被拒绝或未授予，请在浏览器设置中允许后重试';
    }
    case 'NotFoundError':
    case 'OverconstrainedError': {
      const devices = await readInputDevices();

      if (devices && !devices.audio && devices.video) {
        return '未检测到可用的麦克风（无音频输入设备），请连接麦克风后重试';
      }
      if (devices && devices.audio && !devices.video) {
        return '未检测到可用的摄像头，请连接摄像头后重试';
      }
      if (devices && !devices.audio && !devices.video) {
        return '未检测到可用的摄像头和麦克风';
      }
      return '未检测到可用的摄像头或麦克风';
    }
    case 'NotReadableError':
      return '摄像头或麦克风被其他程序占用，请关闭占用程序后重试';
    default:
      return `无法开始录制：${error instanceof Error ? error.message : String(error)}`;
  }
}

export default function VideoRecorder({
  disabled = false,
  playbackSrc = null,
  onRecorded,
  onRecordingChange,
}: VideoRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 录制流没有音频轨道时提示，避免用户误以为视频有声音。
  const [audioWarning, setAudioWarning] = useState<string | null>(null);
  // 记录加载失败的地址：换一个地址（重录后）会自动重试，不会永久停留在失败态。
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const releaseStream = useCallback(() => {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;

      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }

      releaseStream();
    };
  }, [releaseStream]);

  async function startRecording() {
    setError(null);
    setAudioWarning(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError('当前浏览器不支持摄像头录制（需要 getUserMedia 与 MediaRecorder）');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;

      // 判据只看「是否存在可用（live 且 enabled）的音频轨」。
      // 不能用 track.muted：Chromium 的音频轨在音频帧真正到达前可能一直为
      // muted=true，用它判定会误报“没有麦克风”。
      const hasLiveAudioTrack = stream
        .getAudioTracks()
        .some((track) => track.readyState === 'live' && track.enabled);

      if (!hasLiveAudioTrack) {
        setAudioWarning('未检测到麦克风，本次录制将没有声音。');
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const mimeType = MIME_CANDIDATES.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        // 只按「是否存在 live 且 enabled 的音频轨」判定，blob.type 仅作辅助。
        // 不使用 track.muted：Chromium 会在音频帧流动前保持 muted=true，
        // 之前用它做判据导致有音频的录制被误报为「未包含音频」。
        const audioAvailable = Boolean(
          streamRef.current
            ?.getAudioTracks()
            .some((track) => track.readyState === 'live' && track.enabled),
        );

        const chunks = chunksRef.current;
        chunksRef.current = [];

        const blob = new Blob(chunks, {
          type: recorder.mimeType || 'video/webm',
        });

        recorderRef.current = null;
        setRecording(false);
        onRecordingChange?.(false);
        releaseStream();

        if (!audioAvailable) {
          setAudioWarning(AUDIO_TRACK_WARNING);
        }

        if (blob.size > 0) {
          onRecorded(blob);
        } else {
          setError('没有录到有效的视频数据，请重新答题');
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      onRecordingChange?.(true);
    } catch (recordError) {
      releaseStream();
      setError(await describeMediaError(recordError));
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }

  // 有可播放的视频时才提供回看；加载失败按无视频处理（占位图 + 轻提示）。
  const playbackFailed = Boolean(playbackSrc) && failedSrc === playbackSrc;
  const hasPlayback = Boolean(playbackSrc) && !playbackFailed;

  const buttonLabel = recording
    ? '答题结束'
    : hasPlayback
      ? '重新答题'
      : '开始答题';

  return (
    <div className="space-y-3">
      {/* 唯一的视频容器：录制时是实时预览，有视频时是回看，无视频时是占位图。 */}
      <div className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-card bg-night shadow-card">
        {/* 实时预览始终挂载，仅录制时可见，保证 getUserMedia 后能立即绑定 srcObject。 */}
        <video
          ref={videoRef}
          muted
          playsInline
          className={
            recording ? 'h-full w-full object-cover' : 'hidden'
          }
        />

        {!recording && hasPlayback && (
          <video
            key={playbackSrc}
            src={playbackSrc ?? undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setFailedSrc(playbackSrc ?? null)}
            className="h-full w-full object-contain"
          />
        )}

        {!recording && !hasPlayback && (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Image
              src="/interview-placeholder.svg"
              alt="尚未录制回答"
              width={240}
              height={160}
              // SVG 为矢量图，无需位图优化；unoptimized 可避免额外的
              // dangerouslyAllowSVG 配置，也保留清晰度。
              unoptimized
              draggable={false}
              className="h-24 w-auto max-w-full object-contain opacity-90"
            />
            <p
              className={
                playbackFailed
                  ? 'text-xs text-peach'
                  : 'text-xs text-peach-100'
              }
            >
              {playbackFailed
                ? '视频加载失败，请重新录制该题'
                : '尚未录制，点击下方按钮开始答题'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={disabled}
          className={
            recording
              ? 'rounded-pill bg-blush px-6 py-2.5 font-semibold text-ink shadow-float transition-colors hover:bg-blush-200 disabled:cursor-not-allowed disabled:opacity-60'
              : `rounded-pill bg-mint px-6 py-2.5 font-semibold text-ink shadow-float transition-colors hover:bg-mint-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                  disabled ? '' : 'animate-record-pulse motion-reduce:animate-none'
                }`
          }
        >
          {buttonLabel}
        </button>

        {recording && (
          <span className="text-sm font-semibold text-blush-700">● 正在录制…</span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-control bg-blush-50 px-4 py-3 text-sm text-blush-700 shadow-soft">
          {error}
        </p>
      )}

      {audioWarning && (
        <p
          role="status"
          className="rounded-control bg-peach-50 px-4 py-3 text-sm text-peach-700 shadow-soft"
        >
          {audioWarning}
        </p>
      )}
    </div>
  );
}
