import { useCallback, useEffect, useState } from 'react';

export interface StorageInfo {
  /** 사용 중인 바이트. 브라우저가 알려 주지 않으면 null */
  usage: number | null;
  quota: number | null;
  /** 영구 저장 여부. 알 수 없으면 null */
  persisted: boolean | null;
  supported: boolean;
}

const UNKNOWN: StorageInfo = { usage: null, quota: null, persisted: null, supported: false };

async function readStorageInfo(): Promise<StorageInfo> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage) return UNKNOWN;
  const [estimate, persisted] = await Promise.all([
    storage.estimate?.().catch(() => undefined),
    storage.persisted?.().catch(() => undefined),
  ]);
  return {
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    persisted: persisted ?? null,
    supported: true,
  };
}

/** 영구 저장을 요청한다. 브라우저가 거절할 수 있다. 지원하지 않으면 false. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage;
    if (!storage?.persist) return false;
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

/** 설정 화면 "정보" 섹션용 저장소 사용량·영구 저장 상태. */
export function useStorageInfo(): { info: StorageInfo | null; refresh: () => void } {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = useCallback(() => {
    readStorageInfo().then(setInfo, () => setInfo(UNKNOWN));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { info, refresh };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}
