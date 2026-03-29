import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import type { CopySubscription, Trader, Portfolio } from "@copy-cat/shared";

const TRANSITION_CONFIG = {
  duration: 250,
  easing: Easing.bezier(0.19, 1, 0.22, 1),
};

export interface CopyCardData {
  subscription: CopySubscription;
  trader: Pick<Trader, "id" | "display_name" | "avatar_url">;
  portfolio: Pick<Portfolio, "id" | "name">;
  todayTradeCount: number;
}

interface CopyCardProps {
  data: CopyCardData;
  index?: number;
  onTogglePause?: (id: string, paused: boolean) => void;
}

export function CopyCard({ data, index = 0, onTogglePause }: CopyCardProps) {
  const { subscription, trader, portfolio, todayTradeCount } = data;
  const [expanded, setExpanded] = useState(false);

  const isActive = subscription.status === "active";
  const isPositive = subscription.total_pnl >= 0;

  const bgProgress = useSharedValue(isActive ? 1 : 0);

  const animatedBg = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      bgProgress.value,
      [0, 1],
      ["rgba(45, 45, 45, 1)", "rgba(30, 30, 30, 1)"]
    );
    return { backgroundColor };
  });

  const handleToggle = (value: boolean) => {
    bgProgress.value = withTiming(value ? 1 : 0, TRANSITION_CONFIG);
    onTogglePause?.(subscription.id, !value);
  };

  const toggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_CONFIG.duration)
        .easing(TRANSITION_CONFIG.easing)
        .delay(index * 60)}
      layout={Layout.duration(TRANSITION_CONFIG.duration).easing(
        TRANSITION_CONFIG.easing
      )}
    >
      <Animated.View
        style={animatedBg}
        className="mb-3 overflow-hidden rounded-2xl"
      >
        <Pressable onPress={toggleExpand} className="p-4">
          {/* Header row */}
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-semibold text-base text-white">
                {portfolio.name}
              </Text>
              <Text className="mt-0.5 text-xs text-neutral-400">
                by {trader.display_name}
              </Text>
            </View>

            <Switch
              value={isActive}
              onValueChange={handleToggle}
              trackColor={{ false: "#3d3d3d", true: "#22c55e" }}
              thumbColor="#ffffff"
            />
          </View>

          {/* Stats row */}
          <View className="mt-3 flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-neutral-500">Allocation</Text>
              <Text className="font-medium text-sm text-white">
                ${subscription.allocation_amount.toLocaleString()}
              </Text>
            </View>

            <View className="items-center">
              <Text className="text-xs text-neutral-500">PnL</Text>
              <Text
                className={`font-bold text-sm ${
                  isPositive ? "text-success" : "text-danger"
                }`}
              >
                {isPositive ? "+" : ""}$
                {Math.abs(subscription.total_pnl).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                {"  "}
                <Text
                  className={`font-medium text-xs ${
                    isPositive ? "text-success" : "text-danger"
                  }`}
                >
                  ({isPositive ? "+" : ""}
                  {subscription.total_pnl_pct.toFixed(2)}%)
                </Text>
              </Text>
            </View>

            <View className="items-end">
              <Text className="text-xs text-neutral-500">Today</Text>
              <Text className="font-medium text-sm text-white">
                {todayTradeCount} trade{todayTradeCount !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {/* Expanded details */}
          {expanded && (
            <Animated.View
              layout={Layout.duration(TRANSITION_CONFIG.duration).easing(
                TRANSITION_CONFIG.easing
              )}
              className="mt-3 border-t border-surface-300 pt-3"
            >
              <View className="flex-row justify-between">
                <DetailItem label="Copy Ratio" value={`${(subscription.copy_ratio * 100).toFixed(0)}%`} />
                <DetailItem label="Max Position" value={`${(subscription.max_position_pct * 100).toFixed(0)}%`} />
                <DetailItem
                  label="Trades Copied"
                  value={subscription.trades_copied.toString()}
                />
              </View>
              {(subscription.stop_loss_pct != null ||
                subscription.take_profit_pct != null) && (
                <View className="mt-2 flex-row justify-between">
                  {subscription.stop_loss_pct != null && (
                    <DetailItem
                      label="Stop Loss"
                      value={`-${subscription.stop_loss_pct}%`}
                      valueClass="text-danger"
                    />
                  )}
                  {subscription.take_profit_pct != null && (
                    <DetailItem
                      label="Take Profit"
                      value={`+${subscription.take_profit_pct}%`}
                      valueClass="text-success"
                    />
                  )}
                </View>
              )}
              <Text className="mt-2 text-xs text-neutral-600">
                Status: {subscription.status}
              </Text>
            </Animated.View>
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function DetailItem({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <View>
      <Text className="text-xs text-neutral-500">{label}</Text>
      <Text className={`font-medium text-sm ${valueClass}`}>{value}</Text>
    </View>
  );
}
