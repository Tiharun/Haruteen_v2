import { useEffect } from 'react';
import { useHasData } from '../db/backup';
import { requestPersistentStorage } from '../hooks/useStorage';

/**
 * 첫 데이터가 생기면 영구 저장을 요청한다. (DESIGN.md §8.3)
 * 브라우저가 거절할 수 있고, 결과는 설정 > 정보에 표시한다. 이미 허용된 경우 다시 묻지 않는다.
 */
export function PersistStorageRequester() {
  const hasData = useHasData();
  useEffect(() => {
    if (hasData) void requestPersistentStorage();
  }, [hasData]);
  return null;
}
