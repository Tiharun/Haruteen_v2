// 테스트용 가짜 'virtual:pwa-register'. 서비스 워커를 등록하지 않는다.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
