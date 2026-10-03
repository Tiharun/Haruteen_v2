// 첫 렌더 전에 테마를 적용한다(깜빡임 방지). CSP(script-src 'self') 때문에 외부 파일로 둔다.
(function () {
  try {
    var t = localStorage.getItem('haruteen:theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {
    /* localStorage 차단 시 시스템 설정을 따른다 */
  }
})();
