// DESIGN.md §4.4 "알림 세부". 소리(Web Audio)와 시스템 알림. 어떤 실패도 앱 동작을 막지 않는다.

type AudioContextCtor = typeof AudioContext;

let audioContext: AudioContext | null = null;

function createAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  try {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  } catch {
    audioContext = null;
  }
  return audioContext;
}

/** 사용자가 시작·재개 버튼을 누를 때 불러 둔다. 브라우저는 사용자 동작 안에서 만든 AudioContext만 소리를 허용한다. */
export function primeAudio(): void {
  const ctx = createAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => undefined);
}

const BEEP_COUNT = 3;
const BEEP_SECONDS = 0.18;
const BEEP_GAP_SECONDS = 0.14;
const BEEP_HZ = 880;

/** 짧은 비프 3회. volume은 0~100. 실패하면 조용히 넘어간다. */
export function playBeeps(volume: number): void {
  try {
    const ctx = createAudioContext();
    if (!ctx || volume <= 0) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);

    const peak = Math.min(1, Math.max(0, volume / 100)) * 0.4; // 귀가 아프지 않게 최대 0.4
    const start = ctx.currentTime + 0.02;
    for (let i = 0; i < BEEP_COUNT; i += 1) {
      const at = start + i * (BEEP_SECONDS + BEEP_GAP_SECONDS);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = BEEP_HZ;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.02);
      gain.gain.linearRampToValueAtTime(0, at + BEEP_SECONDS);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + BEEP_SECONDS + 0.02);
    }
  } catch {
    // 소리를 못 내도 타이머는 계속 동작한다.
  }
}

export type NotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationStatus(): NotificationStatus {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** 권한 요청. 설정 화면의 버튼에서만 부른다(페이지 로드 시 요청 금지). */
export async function requestNotificationPermission(): Promise<NotificationStatus> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationStatus();
  }
}

/** 시스템 알림. 탭이 숨겨져 있고 권한이 있을 때만 띄운다. 띄웠으면 true. */
export function showSystemNotification(title: string, body: string): boolean {
  if (document.visibilityState !== 'hidden') return false;
  if (notificationStatus() !== 'granted') return false;
  try {
    const notification = new Notification(title, { body, tag: 'haruteen-timer' });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
