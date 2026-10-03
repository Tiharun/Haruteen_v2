import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { PageHeader } from '../../components/PageHeader';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import type { ThemeSetting } from '../../domain/types';
import { LIMITS } from '../../domain/validation';
import {
  notificationStatus,
  playBeeps,
  primeAudio,
  requestNotificationPermission,
  type NotificationStatus,
} from '../../hooks/timerAlerts';
import { useSettings } from '../../hooks/useSettings';
import { DataSection } from './DataSection';
import { DateSection } from './DateSection';
import { DevToolsSection } from './DevToolsSection';
import { InfoSection } from './InfoSection';
import { NumberSetting } from './NumberSetting';
import fieldStyles from '../../components/Field.module.css';
import styles from './SettingsPage.module.css';

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: '시스템 설정 따르기' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

const NOTIFICATION_STATUS_TEXT: Record<NotificationStatus, string> = {
  unsupported: '이 브라우저에서는 시스템 알림을 지원하지 않아요.',
  default: '아직 허용하지 않았어요.',
  granted: '허용됨',
  denied: '거부됨',
};

function useNotificationStatus(): [NotificationStatus, (next: NotificationStatus) => void] {
  const [status, setStatus] = useState<NotificationStatus>(() => notificationStatus());
  // 브라우저 설정에서 권한을 바꾸고 돌아왔을 때 다시 읽는다.
  useEffect(() => {
    const refresh = () => setStatus(notificationStatus());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return [status, setStatus];
}

export function SettingsPage() {
  const toast = useToast();
  const { settings, update, ready } = useSettings();
  const [permission, setPermission] = useNotificationStatus();

  const save = (patch: Parameters<typeof update>[0]) => {
    update(patch).catch(() => toast.show({ message: '저장하지 못했어요.' }));
  };

  const askPermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      save({ notificationsEnabled: true });
      toast.show({ message: '시스템 알림을 허용했어요.' });
    }
  };

  // 숫자 입력칸은 처음 렌더할 때의 값으로 글자를 채우므로, 저장된 설정을 읽은 뒤에 그린다.
  if (!ready) return <PageHeader title="설정" />;

  return (
    <>
      <PageHeader title="설정" />
      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="settings-timer">
          <h2 id="settings-timer" className={styles.heading}>
            타이머
          </h2>
          <p className={fieldStyles.hint}>
            바꾼 값은 진행 중인 단계가 아니라 다음 단계부터 적용돼요.
          </p>
          <NumberSetting
            settingKey="focusMinutes"
            label="집중 시간"
            unit="분"
            value={settings.focusMinutes}
            onSave={(focusMinutes) => update({ focusMinutes })}
          />
          <NumberSetting
            settingKey="shortBreakMinutes"
            label="짧은 휴식"
            unit="분"
            value={settings.shortBreakMinutes}
            onSave={(shortBreakMinutes) => update({ shortBreakMinutes })}
          />
          <NumberSetting
            settingKey="longBreakMinutes"
            label="긴 휴식"
            unit="분"
            value={settings.longBreakMinutes}
            onSave={(longBreakMinutes) => update({ longBreakMinutes })}
          />
          <NumberSetting
            settingKey="longBreakInterval"
            label="긴 휴식 간격 (집중 몇 번마다)"
            unit="회"
            value={settings.longBreakInterval}
            onSave={(longBreakInterval) => update({ longBreakInterval })}
          />
          <Checkbox
            label="집중이 끝나면 휴식을 자동으로 시작"
            checked={settings.autoStartBreak}
            onChange={(e) => save({ autoStartBreak: e.target.checked })}
          />
          <Checkbox
            label="휴식이 끝나면 집중을 자동으로 시작"
            checked={settings.autoStartFocus}
            onChange={(e) => save({ autoStartFocus: e.target.checked })}
          />
        </section>

        <section className={styles.section} aria-labelledby="settings-notify">
          <h2 id="settings-notify" className={styles.heading}>
            알림
          </h2>

          <Checkbox
            label="끝났을 때 소리 내기"
            checked={settings.soundEnabled}
            onChange={(e) => save({ soundEnabled: e.target.checked })}
          />
          <div className={fieldStyles.field}>
            <label htmlFor="sound-volume" className={fieldStyles.label}>
              소리 크기 ({settings.soundVolume})
            </label>
            <input
              id="sound-volume"
              type="range"
              className={styles.range}
              min={LIMITS.soundVolume.min}
              max={LIMITS.soundVolume.max}
              step={1}
              value={settings.soundVolume}
              disabled={!settings.soundEnabled}
              onChange={(e) => save({ soundVolume: Number(e.target.value) })}
            />
          </div>
          <div>
            <Button
              onClick={() => {
                primeAudio();
                playBeeps(settings.soundVolume);
              }}
              disabled={!settings.soundEnabled}
            >
              소리 테스트
            </Button>
          </div>

          <div className={styles.group}>
            <p className={fieldStyles.label}>시스템 알림</p>
            <p>
              상태: <strong>{NOTIFICATION_STATUS_TEXT[permission]}</strong>
            </p>
            {permission === 'default' && (
              <div>
                <Button onClick={() => void askPermission()}>알림 허용하기</Button>
              </div>
            )}
            {permission === 'denied' && (
              <p className={fieldStyles.hint}>
                브라우저가 알림을 막고 있어요. 주소창 왼쪽의 자물쇠(사이트 정보) 아이콘 → 사이트
                설정에서 알림을 “허용”으로 바꾼 뒤 이 화면으로 돌아오세요.
              </p>
            )}
            <Checkbox
              label="다른 탭을 보고 있을 때 끝나면 시스템 알림 보내기"
              checked={settings.notificationsEnabled && permission === 'granted'}
              disabled={permission !== 'granted'}
              onChange={(e) => save({ notificationsEnabled: e.target.checked })}
            />
          </div>

          <Checkbox
            label="탭 제목에 남은 시간 표시"
            checked={settings.showTimerInTitle}
            onChange={(e) => save({ showTimerInTitle: e.target.checked })}
          />
        </section>

        <DateSection />

        <section className={styles.section} aria-labelledby="settings-display">
          <h2 id="settings-display" className={styles.heading}>
            화면
          </h2>
          <Select
            label="테마"
            value={settings.theme}
            onChange={(e) => save({ theme: e.target.value as ThemeSetting })}
          >
            {THEME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </section>

        <DataSection />
        <InfoSection />
        {import.meta.env.DEV && <DevToolsSection />}
      </div>
    </>
  );
}
