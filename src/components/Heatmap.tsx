import { useId } from 'react';
import styles from './Heatmap.module.css';

export type HeatmapKind = 'done' | 'partial' | 'missed' | 'off' | 'untracked' | 'blank' | 'future';

export interface HeatmapCell {
  key: string;
  kind: HeatmapKind;
  /** partial일 때 농도 단계 */
  level?: 1 | 2 | 3;
  /** 마우스를 올렸을 때(title)와 스크린리더(aria-label)에 쓰는 설명 */
  label: string;
}

export interface HeatmapProps {
  /** 열 = 주, 각 열은 위에서 아래로 7칸 */
  weeks: HeatmapCell[][];
  /** 행 이름(7개). 예: 월 화 수 … */
  rowLabels: string[];
  /** 월 표시 등 열 위쪽 글자. 없으면 빈칸 */
  columnLabels?: (string | null)[];
  ariaLabel: string;
}

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 22;
const TOP = 16;

const LEVEL_OPACITY = { 1: 0.35, 2: 0.6, 3: 0.85 } as const;

const LEGEND: { kind: Exclude<HeatmapKind, 'future' | 'blank'>; text: string }[] = [
  { kind: 'done', text: '달성' },
  { kind: 'partial', text: '일부' },
  { kind: 'missed', text: '미달성' },
  { kind: 'off', text: '예정일 아님' },
  { kind: 'untracked', text: '기록 대상 아님' },
];

/**
 * 연간 히트맵(SVG). 색만으로 구분하지 않도록 상태마다 모양이 다르다.
 * 달성 = 꽉 찬 칸, 일부 = 옅게 찬 칸(3단계), 미달성 예정일 = 속이 빈 테두리, 비예정일 = 빗금,
 * 시작 전·보관 후 = 연한 회색 칸, 미래 = 작은 점.
 */
export function Heatmap({ weeks, rowLabels, columnLabels, ariaLabel }: HeatmapProps) {
  const patternId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const width = LEFT + weeks.length * STEP;
  const height = TOP + 7 * STEP;

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={ariaLabel}
      >
        <defs>
          <pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M-1 1 L1 -1 M0 4 L4 0 M3 5 L5 3" className={styles.hatch} />
          </pattern>
        </defs>
        {rowLabels.map((name, row) => (
          <text
            key={name}
            className={styles.axis}
            x={0}
            y={TOP + row * STEP + CELL - 2}
            aria-hidden="true"
          >
            {row % 2 === 0 ? name : ''}
          </text>
        ))}
        {weeks.map((column, col) => {
          const x = LEFT + col * STEP;
          const heading = columnLabels?.[col];
          return (
            <g key={column[0]?.key ?? col}>
              {heading && (
                <text className={styles.axis} x={x} y={10} aria-hidden="true">
                  {heading}
                </text>
              )}
              {column.map((cell, row) => {
                const y = TOP + row * STEP;
                if (cell.kind === 'future') {
                  return (
                    <circle
                      key={cell.key}
                      className={styles.future}
                      cx={x + CELL / 2}
                      cy={y + CELL / 2}
                      r={1.5}
                      role="img"
                      aria-label={cell.label}
                    >
                      <title>{cell.label}</title>
                    </circle>
                  );
                }
                const common = {
                  x,
                  y,
                  width: CELL,
                  height: CELL,
                  rx: 2,
                  role: 'img',
                  'aria-label': cell.label,
                } as const;
                if (cell.kind === 'off') {
                  return (
                    <rect
                      key={cell.key}
                      {...common}
                      fill={`url(#${patternId})`}
                      className={styles.off}
                    >
                      <title>{cell.label}</title>
                    </rect>
                  );
                }
                return (
                  <rect
                    key={cell.key}
                    {...common}
                    className={styles[cell.kind]}
                    fillOpacity={
                      cell.kind === 'partial' ? LEVEL_OPACITY[cell.level ?? 1] : undefined
                    }
                  >
                    <title>{cell.label}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <ul className={styles.legend} aria-hidden="true">
        {LEGEND.map((item) => (
          <li key={item.text}>
            <svg width={CELL} height={CELL} viewBox={`0 0 ${CELL} ${CELL}`}>
              <rect
                x={0.75}
                y={0.75}
                width={CELL - 1.5}
                height={CELL - 1.5}
                rx={2}
                className={styles[item.kind]}
                fill={item.kind === 'off' ? `url(#${patternId})` : undefined}
                fillOpacity={item.kind === 'partial' ? LEVEL_OPACITY[2] : undefined}
              />
            </svg>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
