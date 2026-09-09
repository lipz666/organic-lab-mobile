import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

import { theme } from "./theme";
import type { SpectrumPoint } from "../photo/spectra";

/**
 * 图表用 react-native-svg 手绘，不引图表库。
 *
 * 这些图要么画光谱要么画拟合，形状固定、数据量小，通用图表库带来的体积和
 * 样式覆盖成本都不划算。手绘也更容易让配色跟着主题走。
 */

const PADDING = { left: 38, right: 12, top: 14, bottom: 26 };

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 0.001; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

function formatTick(value: number): string {
  if (value === 0) return "0";
  const absolute = Math.abs(value);
  if (absolute >= 1000 || absolute < 0.01) return value.toExponential(1).replace("e+", "e");
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(absolute < 1 ? 2 : 1);
}

export type Series = {
  label: string;
  points: SpectrumPoint[];
  color: string;
  /** 发射谱填成面，吸收谱只画线。 */
  filled?: boolean;
  dashed?: boolean;
};

/**
 * 光谱叠图。每条曲线各自对自身峰值归一，这样一条吸收谱和一条发射谱
 * 能在同一张图上比形状——它们的物理单位本来就不可比。
 */
export function SpectrumChart({
  series,
  width,
  height = 200,
  highlightRange,
  xLabel = "波长 / nm",
}: {
  series: Series[];
  width: number;
  height?: number;
  highlightRange?: { min: number; max: number } | null;
  xLabel?: string;
}) {
  const chart = useMemo(() => {
    const all = series.flatMap((entry) => entry.points);
    if (all.length === 0) return null;

    const xMin = Math.min(...all.map((point) => point.wavelengthNm));
    const xMax = Math.max(...all.map((point) => point.wavelengthNm));
    const innerWidth = width - PADDING.left - PADDING.right;
    const innerHeight = height - PADDING.top - PADDING.bottom;

    const scaleX = (value: number) =>
      PADDING.left + (xMax === xMin ? innerWidth / 2 : ((value - xMin) / (xMax - xMin)) * innerWidth);
    const scaleY = (value: number) => PADDING.top + innerHeight - value * innerHeight;

    const paths = series.map((entry) => {
      const peak = Math.max(...entry.points.map((point) => point.value), 1e-12);
      const normalized = entry.points.map((point) => ({
        x: scaleX(point.wavelengthNm),
        y: scaleY(Math.max(point.value, 0) / peak),
      }));
      const line = normalized
        .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(" ");
      const baseline = scaleY(0);
      const area =
        normalized.length > 0
          ? `${line} L${normalized[normalized.length - 1].x.toFixed(2)},${baseline.toFixed(2)} L${normalized[0].x.toFixed(2)},${baseline.toFixed(2)} Z`
          : "";
      return { ...entry, line, area };
    });

    return { xMin, xMax, scaleX, scaleY, paths, innerHeight, ticks: niceTicks(xMin, xMax, 5) };
  }, [series, width, height]);

  if (!chart) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>没有可绘制的数据</Text>
      </View>
    );
  }

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          {chart.paths.map((entry, index) => (
            <LinearGradient key={index} id={`fill-${index}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={entry.color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={entry.color} stopOpacity={0.02} />
            </LinearGradient>
          ))}
        </Defs>

        {highlightRange && (
          <Rect
            x={chart.scaleX(highlightRange.min)}
            y={PADDING.top}
            width={Math.max(chart.scaleX(highlightRange.max) - chart.scaleX(highlightRange.min), 1)}
            height={chart.innerHeight}
            fill={theme.success}
            opacity={0.08}
          />
        )}

        {[0, 0.5, 1].map((fraction) => (
          <Line
            key={fraction}
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={chart.scaleY(fraction)}
            y2={chart.scaleY(fraction)}
            stroke={theme.border}
            strokeWidth={1}
            strokeDasharray={fraction === 0 ? undefined : "3 4"}
          />
        ))}

        {chart.ticks.map((tick) => (
          <G key={tick}>
            <Line
              x1={chart.scaleX(tick)}
              x2={chart.scaleX(tick)}
              y1={chart.scaleY(0)}
              y2={chart.scaleY(0) + 4}
              stroke={theme.borderStrong}
              strokeWidth={1}
            />
            <SvgText
              x={chart.scaleX(tick)}
              y={height - 8}
              fontSize={10}
              fill={theme.textFaint}
              textAnchor="middle"
            >
              {formatTick(tick)}
            </SvgText>
          </G>
        ))}

        {chart.paths.map((entry, index) => (
          <G key={entry.label}>
            {entry.filled && <Path d={entry.area} fill={`url(#fill-${index})`} />}
            <Path
              d={entry.line}
              stroke={entry.color}
              strokeWidth={2}
              fill="none"
              strokeDasharray={entry.dashed ? "5 4" : undefined}
            />
          </G>
        ))}

        <SvgText x={PADDING.left - 6} y={chart.scaleY(1) + 4} fontSize={10} fill={theme.textFaint} textAnchor="end">
          1.0
        </SvgText>
        <SvgText x={PADDING.left - 6} y={chart.scaleY(0) + 4} fontSize={10} fill={theme.textFaint} textAnchor="end">
          0
        </SvgText>
      </Svg>

      <View style={styles.legend}>
        {series.map((entry) => (
          <View key={entry.label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: entry.color }]} />
            <Text style={styles.legendLabel}>{entry.label}</Text>
          </View>
        ))}
        <Text style={styles.axisLabel}>{xLabel}（各自归一）</Text>
      </View>
    </View>
  );
}

/** Stern–Volmer 散点 + 拟合直线。离群点用空心红圈标出。 */
export function ScatterFitChart({
  points,
  slope,
  intercept,
  outlierIndices,
  width,
  height = 200,
  xLabel = "[Q] / M",
  yLabel = "I₀ / I",
}: {
  points: { x: number; y: number }[];
  slope: number;
  intercept: number;
  outlierIndices: number[];
  width: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}) {
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const xMin = Math.min(...xValues, 0);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues, 1);
    const yMax = Math.max(...yValues);
    const yPad = (yMax - yMin) * 0.12 || 0.1;

    const innerWidth = width - PADDING.left - PADDING.right;
    const innerHeight = height - PADDING.top - PADDING.bottom;
    const scaleX = (value: number) =>
      PADDING.left + (xMax === xMin ? innerWidth / 2 : ((value - xMin) / (xMax - xMin)) * innerWidth);
    const scaleY = (value: number) =>
      PADDING.top + innerHeight - ((value - (yMin - yPad)) / (yMax + yPad - (yMin - yPad))) * innerHeight;

    return {
      scaleX,
      scaleY,
      xMin,
      xMax,
      xTicks: niceTicks(xMin, xMax, 4),
      yTicks: niceTicks(yMin - yPad, yMax + yPad, 4),
    };
  }, [points, width, height, slope, intercept]);

  if (!chart) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>没有可绘制的数据</Text>
      </View>
    );
  }

  return (
    <View>
      <Svg width={width} height={height}>
        {chart.yTicks.map((tick) => (
          <G key={`y-${tick}`}>
            <Line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={chart.scaleY(tick)}
              y2={chart.scaleY(tick)}
              stroke={theme.border}
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <SvgText
              x={PADDING.left - 6}
              y={chart.scaleY(tick) + 3}
              fontSize={10}
              fill={theme.textFaint}
              textAnchor="end"
            >
              {formatTick(tick)}
            </SvgText>
          </G>
        ))}

        {chart.xTicks.map((tick) => (
          <SvgText
            key={`x-${tick}`}
            x={chart.scaleX(tick)}
            y={height - 8}
            fontSize={10}
            fill={theme.textFaint}
            textAnchor="middle"
          >
            {formatTick(tick)}
          </SvgText>
        ))}

        <Line
          x1={chart.scaleX(chart.xMin)}
          y1={chart.scaleY(slope * chart.xMin + intercept)}
          x2={chart.scaleX(chart.xMax)}
          y2={chart.scaleY(slope * chart.xMax + intercept)}
          stroke={theme.accent}
          strokeWidth={2}
        />

        {points.map((point, index) => {
          const isOutlier = outlierIndices.includes(index);
          return (
            <Circle
              key={index}
              cx={chart.scaleX(point.x)}
              cy={chart.scaleY(point.y)}
              r={isOutlier ? 6 : 4.5}
              fill={isOutlier ? "none" : theme.text}
              stroke={isOutlier ? theme.danger : theme.surface}
              strokeWidth={isOutlier ? 2 : 1.5}
            />
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <Text style={styles.axisLabel}>
          横轴 {xLabel} · 纵轴 {yLabel}
        </Text>
      </View>
    </View>
  );
}

/** 一个 0–1 的水平进度条，用来表达重叠度这类比例量。 */
export function Meter({ value, color, caption }: { value: number; color: string; caption?: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.meterWrap}>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${clamped * 100}%`, backgroundColor: color }]} />
      </View>
      {caption ? <Text style={styles.meterCaption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceAlt,
    borderRadius: theme.radius,
  },
  emptyText: { color: theme.textFaint, fontSize: 12 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.space(3), marginTop: theme.space(1) },
  legendItem: { flexDirection: "row", alignItems: "center", gap: theme.space(1.5) },
  legendSwatch: { width: 12, height: 3, borderRadius: 2 },
  legendLabel: { color: theme.textDim, fontSize: 11 },
  axisLabel: { color: theme.textFaint, fontSize: 10 },
  meterWrap: { gap: theme.space(1) },
  meterTrack: { height: 8, borderRadius: 4, backgroundColor: theme.surfaceStrong, overflow: "hidden" },
  meterFill: { height: 8, borderRadius: 4 },
  meterCaption: { color: theme.textDim, fontSize: 11 },
});
