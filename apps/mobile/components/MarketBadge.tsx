import { Text } from "react-native";
import Animated, {
  FadeIn,
  Easing,
  ZoomIn,
} from "react-native-reanimated";

const TRANSITION_CONFIG = {
  duration: 250,
  easing: Easing.bezier(0.19, 1, 0.22, 1),
};

export type ExtendedMarketType =
  | "stocks"
  | "crypto"
  | "forex"
  | "polymarket"
  | "options"
  | "futures";

const MARKET_CONFIG: Record<
  ExtendedMarketType,
  { label: string; bg: string; text: string }
> = {
  stocks: { label: "Stocks", bg: "bg-blue-600/20", text: "text-blue-400" },
  crypto: { label: "Crypto", bg: "bg-purple-600/20", text: "text-purple-400" },
  forex: { label: "Forex", bg: "bg-green-600/20", text: "text-green-400" },
  polymarket: {
    label: "Polymarket",
    bg: "bg-orange-600/20",
    text: "text-orange-400",
  },
  options: { label: "Options", bg: "bg-cyan-600/20", text: "text-cyan-400" },
  futures: {
    label: "Futures",
    bg: "bg-yellow-600/20",
    text: "text-yellow-400",
  },
};

interface MarketBadgeProps {
  marketType: ExtendedMarketType;
}

export function MarketBadge({ marketType }: MarketBadgeProps) {
  const config = MARKET_CONFIG[marketType] ?? MARKET_CONFIG.stocks;

  return (
    <Animated.View
      entering={ZoomIn.duration(TRANSITION_CONFIG.duration).easing(
        TRANSITION_CONFIG.easing
      )}
      className={`rounded-full px-2 py-0.5 ${config.bg}`}
    >
      <Text className={`font-medium text-xs ${config.text}`}>
        {config.label}
      </Text>
    </Animated.View>
  );
}
