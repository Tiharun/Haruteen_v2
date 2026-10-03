import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import { formatDateLong } from '../../domain/dates';
import { LIMITS, ValidationError } from '../../domain/validation';
import { useSettings } from '../../hooks/useSettings';
import { useToday } from '../../hooks/useToday';
import fieldStyles from '../../components/Field.module.css';
import styles from './SettingsPage.module.css';

const START_HOURS = Array.from(
  { length: LIMITS.dayStartHour.max - LIMITS.dayStartHour.min + 1 },
  (_, i) => i + LIMITS.dayStartHour.min,
);

export function DateSection() {
  const toast = useToast();
  const { settings, update } = useSettings();
  const today = useToday(settings.dayStartHour);

  const save = (patch: Parameters<typeof update>[0]) => {
    update(patch).catch((error: unknown) =>
      toast.show({
        message: error instanceof ValidationError ? error.message : '저장하지 못했어요.',
      }),
    );
  };

  return (
    <section className={styles.section} aria-labelledby="settings-date">
      <h2 id="settings-date" className={styles.heading}>
        날짜
      </h2>
      <Select
        label="하루 시작 시각"
        value={String(settings.dayStartHour)}
        onChange={(e) => save({ dayStartHour: Number(e.target.value) })}
        hint={
          settings.dayStartHour === 0
            ? '자정(0시)에 하루가 바뀌어요. 늦게 자는 편이라면 새벽 시각을 골라 보세요.'
            : `새벽 0시~${settings.dayStartHour}시는 전날로 계산해요.`
        }
      >
        {START_HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {hour === 0 ? '0시 (자정)' : `${hour}시`}
          </option>
        ))}
      </Select>
      <Select
        label="한 주의 시작 요일"
        value={String(settings.weekStartsOn)}
        onChange={(e) => save({ weekStartsOn: e.target.value === '7' ? 7 : 1 })}
      >
        <option value="1">월요일</option>
        <option value="7">일요일</option>
      </Select>
      <p className={fieldStyles.hint}>
        지금 앱이 보는 오늘: <strong>{formatDateLong(today)}</strong>
      </p>
      <p className={fieldStyles.hint}>
        이미 기록한 습관 날짜는 바뀌지 않아요. 집중 시간은 새 기준으로 다시 묶이고, 주간 통계와 습관
        달성률도 새 요일 기준으로 다시 계산돼요.
      </p>
    </section>
  );
}
