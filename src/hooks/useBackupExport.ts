import { useCallback } from 'react';
import { exportBackup, recordBackup } from '../db/backup';

/** 문자열을 파일로 내려받는다. */
function downloadText(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 내려받기가 시작될 시간을 준 뒤 해제한다.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 현재 데이터를 백업 파일로 내려받고 `lastBackupAt`을 기록한다. 실패하면 reject. */
export function useBackupExport(): () => Promise<void> {
  return useCallback(async () => {
    const now = Date.now();
    const { fileName, json } = await exportBackup(now);
    downloadText(fileName, json);
    await recordBackup(now);
  }, []);
}
