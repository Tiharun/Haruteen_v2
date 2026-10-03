import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { toDate } from '../../domain/dates';
import { formatFocusTime, type FocusBucket, type StatsUnit } from '../../domain/stats';
import styles from './StatsPage.module.css';

const MINUTE_MS = 60_000;

export interface FocusChartProps {
  unit: StatsUnit;
  buckets: readonly FocusBucket[];
  /** 스크린리더용 표의 캡션 */
  caption: string;
}

function bucketName(unit: StatsUnit, bucket: FocusBucket): string {
  if (unit === 'year') return bucket.label;
  const date = toDate(bucket.key);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 집중 시간 막대 그래프. 색은 CSS 변수(`var(--…)`)로 지정해 다크 모드에서도 맞게 보인다.
 * 그림은 스크린리더에서 숨기고, 같은 값을 표(`sr-only`)로 제공한다. (DESIGN.md §10 접근성)
 */
export function FocusChart({ unit, buckets, caption }: FocusChartProps) {
  const data = buckets.map((b) => ({
    name: bucketName(unit, b),
    label: b.label,
    // 아직 오지 않은 날·달은 값이 없다(막대 없음)
    minutes: b.ms === null ? undefined : b.ms / MINUTE_MS,
  }));
  // 31개 막대의 축 글자가 겹치지 않도록 월 보기는 하나씩 건너뛰며 쓴다
  const tickInterval = unit === 'month' ? 1 : 0;

  return (
    <div>
      <div className={styles.chart} aria-hidden="true" data-testid="focus-chart">
        <BarChart
          responsive
          width="100%"
          height={240}
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            interval={tickInterval}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            stroke="var(--border-strong)"
            tickLine={false}
          />
          <YAxis
            width={48}
            allowDecimals={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            stroke="var(--border-strong)"
            tickLine={false}
            tickFormatter={(v: number) => `${v}분`}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              color: 'var(--text)',
            }}
            labelStyle={{ color: 'var(--text)' }}
            itemStyle={{ color: 'var(--text)' }}
            labelFormatter={(_, payload) => String(payload?.[0]?.payload?.name ?? '')}
            formatter={(value) => [formatFocusTime(Number(value) * MINUTE_MS), '집중']}
          />
          <Bar
            dataKey="minutes"
            fill="var(--accent)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">기간</th>
            <th scope="col">집중 시간</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <th scope="row">{bucketName(unit, b)}</th>
              <td>{b.ms === null ? '아직 오지 않음' : formatFocusTime(b.ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
