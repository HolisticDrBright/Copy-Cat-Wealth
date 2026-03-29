import { Image, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { Trader, TraderStats } from "@copy-cat/shared";
import { MarketBadge, type ExtendedMarketType } from "./MarketBadge";

const TRANSITION_CONFIG = {
  duration: 250,
  easing: Easing.bezier(0.19, 1, 0.22, 1),
};

type BadgeType = "hot" | "consistent" | "low_risk" | "verified";

const BADGE_MAP: Record<BadgeType, { emoji: string; label: string }> = {
  hot: { emoji: "\uD83D\uDD25", label: "Hot" },
  consistent: { emoji: "\u2705", label: "Consistent" },
  low_risk: { emoji: "\uD83D\uDEE1", label: "Low Risk" },
  verified: { emoji: "\u2611\uFE0F", label: "Verified" },
};

function deriveBadges(trader: Trader, stats: TraderStats): BadgeType[] {
  const badges: BadgeType[] = [];
  if (stats.total_return_pct > 50) badges.push("hot");
  if (stats.win_rate > 0.6 && stats.total_trades > 20) badges.push("consistent");
  if (stats.max_drawdown_pct < 10) badges.push("low_risk");
  if (trader.is_verified) badges.push("verified");
  return badges;
}

interface TraderCardProps {
  trader: Trader;
  stats: TraderStats;
  index?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function TraderCard({ trader, stats, index = 0 }: TraderCardProps) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = withTiming(0.97, TRANSITION_CONFIG);
  };

  const onPressOut = () => {
    scale.value = withTiming(1, TRANSITION_CONFIG);
  };

  const onPress = () => {
    router.push(`/trader/${trader.id}`);
  };

  const badges = deriveBadges(trader, stats);
  const isPositive = stats.total_return_pct >= 0;
  const primaryMarket = (trader.markets[0] ?? "stocks") as ExtendedMarketType;

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_CONFIG.duration)
        .easing(TRANSITION_CONFIG.easing)
        .delay(index * 60)}
      layout={Layout.duration(TRANSITION_CONFIG.duration).easing(
        TRANSITION_CONFIG.easing
      )}
    >
      <AnimatedPressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        style={animatedStyle}
        className="mb-3 rounded-2xl bg-surface-200 p-4"
      >
        <View className="flex-row items-center">
          {/* Avatar */}
          <View className="mr-3 h-12 w-12 overflow-hidden rounded-full bg-surface-300">
            {trader.avatar_url ? (
              <Image
                source={{ uri: trader.avatar_url }}
                className="h-full w-full"
                resizeMode="cover"
              />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <Text className="text-lg font-bold text-white">
                  {trader.display_name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Info */}
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text
                className="font-semibold text-base text-white"
                numberOfLines={1}
              >
                {trader.display_name}
              </Text>
              <MarketBadge marketType={primaryMarket} />
            </View>
            <Text className="mt-0.5 text-xs text-neutral-400">
              {formatFollowers(trader.follower_count)} followers
            </Text>
          </View>

          {/* Return */}
          <View className="items-end">
            <Text
              className={`font-bold text-lg ${
                isPositive ? "text-success" : "text-danger"
              }`}
            >
              {isPositive ? "+" : ""}
              {stats.total_return_pct.toFixed(1)}%
            </Text>
            <Text className="text-xs text-neutral-500">{stats.period}</Text>
          </View>
        </View>

        {/* Badges */}
        {badges.length > 0 && (
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {badges.map((badge) => {
              const config = BADGE_MAP[badge];
              return (
                <View
                  key={badge}
                  className="flex-row items-center rounded-full bg-surface-300 px-2 py-0.5"
                >
                  <Text className="mr-1 text-xs">{config.emoji}</Text>
                  <Text className="text-xs text-neutral-300">
                    {config.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}
