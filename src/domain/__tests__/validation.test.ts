import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '../dates';
import {
  unwrap,
  validateCountTarget,
  validateCountUnit,
  validateHabitEmoji,
  validateHabitGoal,
  validateHabitLogValue,
  validateHabitName,
  validateHabitNote,
  validateHabitSchedule,
  validateHabitStartDate,
  validateCanAddProject,
  validateProjectName,
  validateSubtaskCount,
  validateSubtaskTitle,
  validateTagName,
  validateTaskNote,
  validateTaskTagCount,
  validateTaskTitle,
  validateTimerSetting,
  validateTimerSettingText,
  ValidationError,
} from '../validation';

describe('할 일 제목', () => {
  it('0자와 공백만 있는 입력은 거절한다', () => {
    expect(validateTaskTitle('').ok).toBe(false);
    expect(validateTaskTitle('   \t ').ok).toBe(false);
  });

  it('1자와 200자는 통과하고 201자는 거절한다', () => {
    expect(validateTaskTitle('a').ok).toBe(true);
    expect(validateTaskTitle('a'.repeat(200)).ok).toBe(true);
    const result = validateTaskTitle('a'.repeat(201));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('201/200');
  });

  it('앞뒤 공백을 지우고 NFC로 정규화한다', () => {
    const decomposed = '한'.normalize('NFD');
    expect(validateTaskTitle(`  ${decomposed}  `)).toEqual({ ok: true, value: '한' });
  });

  it('공백은 길이에 세지 않는다(trim 뒤 200자면 통과)', () => {
    expect(validateTaskTitle(` ${'a'.repeat(200)} `).ok).toBe(true);
  });

  it('이모지는 1자로 센다', () => {
    expect(validateTaskTitle('😀'.repeat(200)).ok).toBe(true);
    expect(validateTaskTitle('😀'.repeat(201)).ok).toBe(false);
  });
});

describe('할 일 메모', () => {
  it('빈 메모와 5,000자는 통과하고 5,001자는 거절한다', () => {
    expect(validateTaskNote('').ok).toBe(true);
    expect(validateTaskNote('a'.repeat(5000)).ok).toBe(true);
    expect(validateTaskNote('a'.repeat(5001)).ok).toBe(false);
  });
});

describe('하위 할 일', () => {
  it('제목 1~200자', () => {
    expect(validateSubtaskTitle(' ').ok).toBe(false);
    expect(validateSubtaskTitle('a'.repeat(200)).ok).toBe(true);
    expect(validateSubtaskTitle('a'.repeat(201)).ok).toBe(false);
  });

  it('할 일당 최대 50개', () => {
    expect(validateSubtaskCount(50).ok).toBe(true);
    expect(validateSubtaskCount(51).ok).toBe(false);
  });
});

describe('태그 개수', () => {
  it('할 일당 최대 10개', () => {
    expect(validateTaskTagCount(10).ok).toBe(true);
    expect(validateTaskTagCount(11).ok).toBe(false);
  });
});

describe('프로젝트·태그 이름', () => {
  it('0자·공백만 거절, 1자·30자 통과, 31자 거절', () => {
    expect(validateProjectName('', []).ok).toBe(false);
    expect(validateProjectName('  ', []).ok).toBe(false);
    expect(validateProjectName('a', []).ok).toBe(true);
    expect(validateProjectName('a'.repeat(30), []).ok).toBe(true);
    expect(validateProjectName('a'.repeat(31), []).ok).toBe(false);
    expect(validateTagName('a'.repeat(31), []).ok).toBe(false);
  });

  it('대소문자를 무시하고 중복을 거절한다', () => {
    expect(validateProjectName('Work', ['work']).ok).toBe(false);
    expect(validateProjectName(' WORK ', ['Work']).ok).toBe(false);
    expect(validateTagName('Urgent', ['urgent']).ok).toBe(false);
    expect(validateTagName('Urgent', ['other']).ok).toBe(true);
  });

  it('프로젝트와 태그는 목록이 따로라 이름이 겹쳐도 된다', () => {
    expect(validateTagName('일', []).ok).toBe(true);
    expect(validateProjectName('일', []).ok).toBe(true);
  });

  it('개수 제한: 프로젝트 50개', () => {
    expect(validateCanAddProject(49).ok).toBe(true);
    expect(validateCanAddProject(50).ok).toBe(false);
  });
});

describe('unwrap', () => {
  it('실패하면 이유를 담은 ValidationError를 던진다', () => {
    expect(() => unwrap(validateTaskTitle(''))).toThrow(ValidationError);
    expect(unwrap(validateTaskTitle(' ok '))).toBe('ok');
  });
});

describe('습관 이름·메모', () => {
  it('이름은 0자·공백만 거절, 1자·50자 통과, 51자 거절', () => {
    expect(validateHabitName('').ok).toBe(false);
    expect(validateHabitName('   ').ok).toBe(false);
    expect(validateHabitName('a').ok).toBe(true);
    expect(validateHabitName('a'.repeat(50)).ok).toBe(true);
    expect(validateHabitName('a'.repeat(51)).ok).toBe(false);
  });

  it('메모는 0자·1,000자 통과, 1,001자 거절', () => {
    expect(validateHabitNote('').ok).toBe(true);
    expect(validateHabitNote('a'.repeat(1000)).ok).toBe(true);
    expect(validateHabitNote('a'.repeat(1001)).ok).toBe(false);
  });
});

describe('습관 이모지', () => {
  it('없음·공백은 null, 그래핌 1개는 통과', () => {
    expect(validateHabitEmoji(null)).toEqual({ ok: true, value: null });
    expect(validateHabitEmoji('  ')).toEqual({ ok: true, value: null });
    expect(validateHabitEmoji('💧')).toEqual({ ok: true, value: '💧' });
    // 여러 코드 포인트로 이뤄진 이모지도 그래핌 1개다
    expect(validateHabitEmoji('👨‍👩‍👧').ok).toBe(true);
    expect(validateHabitEmoji('🇰🇷').ok).toBe(true);
  });

  it('2개 이상은 거절', () => {
    expect(validateHabitEmoji('💧💧').ok).toBe(false);
    expect(validateHabitEmoji('ab').ok).toBe(false);
  });
});

describe('횟수형 목표', () => {
  it('목표 횟수는 정수 2~999', () => {
    expect(validateCountTarget(1).ok).toBe(false);
    expect(validateCountTarget(2).ok).toBe(true);
    expect(validateCountTarget(999).ok).toBe(true);
    expect(validateCountTarget(1000).ok).toBe(false);
    expect(validateCountTarget(2.5).ok).toBe(false);
    expect(validateCountTarget(Number.NaN).ok).toBe(false);
  });

  it('단위는 0~10자', () => {
    expect(validateCountUnit('').ok).toBe(true);
    expect(validateCountUnit('a'.repeat(10)).ok).toBe(true);
    expect(validateCountUnit('a'.repeat(11)).ok).toBe(false);
    expect(validateCountUnit('  잔 ')).toEqual({ ok: true, value: '잔' });
  });

  it('목표 전체를 정리해서 돌려준다', () => {
    expect(validateHabitGoal({ type: 'count', target: 8, unit: ' 잔 ' })).toEqual({
      ok: true,
      value: { type: 'count', target: 8, unit: '잔' },
    });
    expect(validateHabitGoal({ type: 'count', target: 1, unit: '잔' }).ok).toBe(false);
    expect(validateHabitGoal({ type: 'check' })).toEqual({ ok: true, value: { type: 'check' } });
  });
});

describe('습관 기록 값', () => {
  it('정수 0~9,999', () => {
    expect(validateHabitLogValue(0).ok).toBe(true);
    expect(validateHabitLogValue(9999).ok).toBe(true);
    expect(validateHabitLogValue(10000).ok).toBe(false);
    expect(validateHabitLogValue(-1).ok).toBe(false);
    expect(validateHabitLogValue(1.5).ok).toBe(false);
  });
});

describe('습관 시작일', () => {
  const today = parseLocalDate('2026-10-03');
  const ok = (text: string) => {
    const date = parseLocalDate(text);
    if (!today || !date) throw new Error('잘못된 날짜');
    return validateHabitStartDate(date, today).ok;
  };

  it('오늘 기준 ±365일까지 통과, 하루 더 가면 거절', () => {
    expect(ok('2025-10-03')).toBe(true); // -365일
    expect(ok('2025-10-02')).toBe(false); // -366일
    expect(ok('2027-10-03')).toBe(true); // +365일
    expect(ok('2027-10-04')).toBe(false); // +366일
  });
});

describe('습관 일정', () => {
  it('요일은 오름차순·중복 없이 저장한다', () => {
    expect(validateHabitSchedule({ type: 'weekdays', days: [5, 1, 3, 1] })).toEqual({
      ok: true,
      value: { type: 'weekdays', days: [1, 3, 5] },
    });
  });

  it('요일 7개를 모두 고르면 daily로 저장한다', () => {
    expect(validateHabitSchedule({ type: 'weekdays', days: [7, 6, 5, 4, 3, 2, 1] })).toEqual({
      ok: true,
      value: { type: 'daily' },
    });
  });

  it('요일이 하나도 없으면 거절한다', () => {
    expect(validateHabitSchedule({ type: 'weekdays', days: [] }).ok).toBe(false);
  });

  it('주 횟수는 1~6', () => {
    expect(validateHabitSchedule({ type: 'weeklyCount', count: 0 }).ok).toBe(false);
    expect(validateHabitSchedule({ type: 'weeklyCount', count: 1 }).ok).toBe(true);
    expect(validateHabitSchedule({ type: 'weeklyCount', count: 6 }).ok).toBe(true);
    expect(validateHabitSchedule({ type: 'weeklyCount', count: 7 }).ok).toBe(false);
    expect(validateHabitSchedule({ type: 'weeklyCount', count: 2.5 }).ok).toBe(false);
  });
});

describe('타이머 설정 검증', () => {
  it('집중 시간 1~120분: 경계값', () => {
    expect(validateTimerSetting('focusMinutes', 0).ok).toBe(false);
    expect(validateTimerSetting('focusMinutes', 1).ok).toBe(true);
    expect(validateTimerSetting('focusMinutes', 120).ok).toBe(true);
    expect(validateTimerSetting('focusMinutes', 121).ok).toBe(false);
  });

  it('짧은 휴식 1~30분, 긴 휴식 1~60분, 긴 휴식 간격 2~10회', () => {
    expect(validateTimerSetting('shortBreakMinutes', 30).ok).toBe(true);
    expect(validateTimerSetting('shortBreakMinutes', 31).ok).toBe(false);
    expect(validateTimerSetting('longBreakMinutes', 60).ok).toBe(true);
    expect(validateTimerSetting('longBreakMinutes', 61).ok).toBe(false);
    expect(validateTimerSetting('longBreakInterval', 1).ok).toBe(false);
    expect(validateTimerSetting('longBreakInterval', 2).ok).toBe(true);
    expect(validateTimerSetting('longBreakInterval', 10).ok).toBe(true);
    expect(validateTimerSetting('longBreakInterval', 11).ok).toBe(false);
  });

  it('정수가 아니면 거부한다', () => {
    expect(validateTimerSetting('focusMinutes', 2.5).ok).toBe(false);
    expect(validateTimerSetting('focusMinutes', Number.NaN).ok).toBe(false);
  });

  it('입력 글자: 빈 값·글자·소수·음수는 실패, 앞뒤 공백은 무시', () => {
    expect(validateTimerSettingText('focusMinutes', '').ok).toBe(false);
    expect(validateTimerSettingText('focusMinutes', 'abc').ok).toBe(false);
    expect(validateTimerSettingText('focusMinutes', '2.5').ok).toBe(false);
    expect(validateTimerSettingText('focusMinutes', '-5').ok).toBe(false);
    expect(validateTimerSettingText('focusMinutes', ' 25 ')).toEqual({ ok: true, value: 25 });
  });
});
