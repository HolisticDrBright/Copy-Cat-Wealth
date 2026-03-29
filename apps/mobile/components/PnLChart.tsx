import { useEffect, useMemo } from "react";
import { Pressable, Text, View, Dimensions } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  Layout,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import type { PnlDataPoint } from "@copy-cat/shared";

const TRANSITION_CONFIG = {
  duration: 250,
  easing: Easing.bezier(0.19, 1, 0.22, 1),
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type ChartPeriod = "1D" | "1W" | "1M" | "All";

interface PnLChartProps {
  data: PnlDataPoint[];
  period: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
}

const PERIODS: ChartPeriod[] = ["1D", "1W", "1M", "All"];
const CHART_HEIGHT = 180;
const CHART_PADDING = 16;

export function PnLChart({ data, period, onPeriodChange }: PnLChartProps) {
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - CHART_PADDING * 4;

  const { path, pathLength, totalPnl, isPositive } = useMemo(() => {
    if (data.length < 2) {
      return { path: "", pathLength: 0, totalPnl: 0, isPositive: true };
    }

    const values = data.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * chartWidth;
      const y = CHART_HEIGHT - ((d.value - minVal) / range) * (CHART_HEIGHT - 20);
      return { x, y };
    });

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.x + (curr.x - prev.x) / 3;
      const cpx2 = prev.x + (2 * (curr.x - prev.x)) / 3;
      d += ` C ${cpx1} ${prev.y} ${cpx2} ${curr.y} ${curr.x} ${curr.y}`;
    }

    // Rough path length estimation for stroke animation
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }

    const first = values[0];
    const last = values[values.length - 1];
    const pnl = last - first;

    return {
      path: d,
      pathLength: length,
      totalPnl: pnl,
      isPositive: pnl >= 0,
    };
  }, [data, chartWidth]);

  const dashOffset = useSharedValue(pathLength);

  useEffect(() => {
    dashOffset.value = pathLength;
    dashOffset.value = withTiming(0, {
      duration: 800,
      easing: TRANSITION_CONFIG.easing,
    });
  }, [path, pathLength]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const color = isPositive ? "#22c55e" : "#ef4444";

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_CONFIG.duration).easing(
        TRANSITION_CONFIG.easing
      )}
      layout={Layout.duration(TRANSITION_CONFIG.duration).easing(
        TRANSITION_CONFIG.easing
      )}
      className="rounded-2xl bg-surface-200 p-4"
    >
      {/* Total PnL display */}
      <View className="mb-3">
        <Text className="text-xs text-neutral-500">Total PnL</Text>
        <Text
          className={`font-bold text-2xl ${
            isPositive ? "text-success" : "text-danger"
          }`}
        >
          {isPositive ? "+" : ""}$
          {Math.abs(totalPnl).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
      </View>

      {/* Chart */}
      <View className="items-center">
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.3" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {path ? (
            <AnimatedPath
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={pathLength}
              animatedProps={animatedProps}
            />
          ) : (
            <Path
              d={`M 0 ${CHART_HEIGHT / 2} L ${chartWidth} ${CHART_HEIGHT / 2}`}
              fill="none"
              stroke="#3d3d3d"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          )}
        </Svg>
      </View>

      {/* Period tabs */}
      <PeriodTabs
        periods={PERIODS}
        active={period}
        onSelect={onPeriodChange}
        color={color}
      />
    </Animated.View>
  );
}

interface PeriodTabsProps {
  periods: ChartPeriod[];
  active: ChartPeriod;
  onSelect: (p: ChartPeriod) => void;
  color: string;
}

function PeriodTabs({ periods, active, onSelect, color }: PeriodTabsProps) {
  const underlineX = useSharedValue(0);
  const tabWidth = 100 / periods.length;

  useEffect(() => {
    const idx = periods.indexOf(active);
    underlineX.value = withTiming(idx * tabWidth, TRANSITION_CONFIG);
  }, [active]);

  const underlineStyle = useAnimatedProps(() => ({
    left: `${underlineX.value}%` as any,
  }));

  return (
    <View className="relative mt-4">
      <View className="flex-row">
        {periods.map((p) => (
          <Pressable
            key={p}
            onPress={() => onSelect(p)}
            className="flex-1 items-center py-2"
          >
            <Text
              className={`font-medium text-sm ${
                p === active ? "text-white" : "text-neutral-500"
              }`}
            >
              {p}
            </Text>
          </Pressable>
        ))}
      </View>
      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: 0,
            height: 2,
            width: `${tabWidth}%`,
            backgroundColor: color,
            borderRadius: 1,
          },
          underlineStyle as any,
        ]}
      />
    </View>
  );
}
