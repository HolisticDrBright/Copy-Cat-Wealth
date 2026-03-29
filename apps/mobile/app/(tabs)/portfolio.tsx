import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeIn,
  Easing,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

const PERIODS = ["1D", "1W", "1M", "All"] as const;
type Period = (typeof PERIODS)[number];

interface Position {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  market: string;
}

interface TradeFeedItem {
  id: string;
  type: "buy" | "sell";
  symbol: string;
  quantity: number;
  price: number;
  timestamp: string;
  traderName: string;
}

const MOCK_POSITIONS: Position[] = [
  {
    id: "p1",
    symbol: "AAPL",
    name: "Apple Inc.",
    quantity: 15,
    avgPrice: 178.5,
    currentPrice: 195.2,
    pnl: 250.5,
    pnlPct: 9.36,
    market: "Stocks",
  },
  {
    id: "p2",
    symbol: "BTC",
    name: "Bitcoin",
    quantity: 0.12,
    avgPrice: 62400,
    currentPrice: 67850,
    pnl: 654.0,
    pnlPct: 8.73,
    market: "Crypto",
  },
  {
    id: "p3",
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    quantity: 8,
    avgPrice: 875.0,
    currentPrice: 920.3,
    pnl: 362.4,
    pnlPct: 5.18,
    market: "Stocks",
  },
  {
    id: "p4",
    symbol: "ETH",
    name: "Ethereum",
    quantity: 2.5,
    avgPrice: 3200,
    currentPrice: 3050,
    pnl: -375.0,
    pnlPct: -4.69,
    market: "Crypto",
  },
  {
    id: "p5",
    symbol: "EUR/USD",
    name: "Euro / US Dollar",
    quantity: 10000,
    avgPrice: 1.082,
    currentPrice: 1.0875,
    pnl: 55.0,
    pnlPct: 0.51,
    market: "Forex",
  },
  {
    id: "p6",
    symbol: "TSLA",
    name: "Tesla Inc.",
    quantity: 5,
    avgPrice: 245.0,
    currentPrice: 262.8,
    pnl: 89.0,
    pnlPct: 7.27,
    market: "Stocks",
  },
];

const MOCK_TRADES: TradeFeedItem[] = [
  {
    id: "t1",
    type: "buy",
    symbol: "AAPL",
    quantity: 5,
    price: 193.4,
    timestamp: "2 min ago",
    traderName: "Alex Morgan",
  },
  {
    id: "t2",
    type: "sell",
    symbol: "ETH",
    quantity: 0.5,
    price: 3045.0,
    timestamp: "15 min ago",
    traderName: "Marcus Webb",
  },
  {
    id: "t3",
    type: "buy",
    symbol: "NVDA",
    quantity: 3,
    price: 918.5,
    timestamp: "1 hr ago",
    traderName: "Nina Patel",
  },
  {
    id: "t4",
    type: "buy",
    symbol: "BTC",
    quantity: 0.05,
    price: 67200.0,
    timestamp: "2 hr ago",
    traderName: "Marcus Webb",
  },
  {
    id: "t5",
    type: "sell",
    symbol: "EUR/USD",
    quantity: 5000,
    price: 1.0878,
    timestamp: "3 hr ago",
    traderName: "Elena Rodriguez",
  },
];

const PERIOD_RETURNS: Record<Period, { value: number; pct: number }> = {
  "1D": { value: 342.5, pct: 1.42 },
  "1W": { value: 1205.8, pct: 5.12 },
  "1M": { value: 2890.4, pct: 12.87 },
  All: { value: 4536.9, pct: 22.45 },
};

function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 300));
      return {
        totalValue: 24536.9,
        positions: MOCK_POSITIONS,
        trades: MOCK_TRADES,
      };
    },
  });
}

function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    const updateDisplay = (v: number) => {
      setDisplayValue(Math.round(v * 100) / 100);
    };

    animatedValue.value = withTiming(value, {
      duration: 800,
      easing: EASE_OUT_EXPO,
    });

    // Simple counter animation using interval
    const startVal = displayValue;
    const diff = value - startVal;
    const steps = 20;
    const stepDuration = 800 / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(
        Math.round((startVal + diff * easedProgress) * 100) / 100
      );
      if (step >= steps) clearInterval(interval);
    }, stepDuration);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <Text className="text-white font-bold text-3xl">
      ${displayValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </Text>
  );
}

function PeriodSelector({
  active,
  onSelect,
}: {
  active: Period;
  onSelect: (p: Period) => void;
}) {
  const indicatorX = useSharedValue(0);
  const tabWidth = useSharedValue(0);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: tabWidth.value,
  }));

  return (
    <View className="flex-row bg-surface-200 rounded-xl p-1 mx-4">
      <Animated.View
        style={indicatorStyle}
        className="absolute top-1 bottom-1 bg-surface-400 rounded-lg"
      />
      {PERIODS.map((period, i) => (
        <TouchableOpacity
          key={period}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            if (period === active) {
              indicatorX.value = x;
              tabWidth.value = width;
            }
          }}
          onPress={() => {
            onSelect(period);
          }}
          className="flex-1 py-2 items-center z-10"
        >
          <Text
            className={`text-sm font-semibold ${
              active === period ? "text-white" : "text-gray-500"
            }`}
          >
            {period}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ChartPlaceholder({ period }: { period: Period }) {
  return (
    <Animated.View
      entering={FadeIn.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
      className="mx-4 mt-4 mb-4 h-48 bg-surface-100 rounded-2xl border border-surface-200 items-center justify-center overflow-hidden"
    >
      {/* Simulated chart lines */}
      <View className="absolute inset-0 flex-row items-end px-2 pb-4">
        {Array.from({ length: 24 }).map((_, i) => {
          const height =
            20 +
            Math.sin(i * 0.5 + (period === "1D" ? 0 : period === "1W" ? 1 : period === "1M" ? 2 : 3)) *
              15 +
            Math.random() * 20;
          return (
            <View
              key={i}
              className="flex-1 mx-0.5 rounded-t bg-brand-500/30"
              style={{ height: `${height}%` }}
            />
          );
        })}
      </View>
      <View className="absolute inset-0 items-center justify-center">
        <Ionicons name="trending-up" size={32} color="#33a5ff" />
        <Text className="text-gray-500 text-xs mt-1">
          {period} Performance
        </Text>
      </View>
    </Animated.View>
  );
}

function PositionRow({
  position,
  index,
}: {
  position: Position;
  index: number;
}) {
  const isPositive = position.pnl >= 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(index * 50)}
      className="flex-row items-center px-4 py-3 border-b border-surface-200"
    >
      <View className="w-10 h-10 bg-surface-300 rounded-full items-center justify-center mr-3">
        <Text className="text-white font-bold text-xs">
          {position.symbol.substring(0, 2)}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-white font-semibold text-sm">
          {position.symbol}
        </Text>
        <Text className="text-gray-500 text-xs">{position.name}</Text>
      </View>
      <View className="items-end">
        <Text className="text-white font-medium text-sm">
          $
          {(position.currentPrice * position.quantity).toLocaleString(
            undefined,
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          )}
        </Text>
        <Text
          className={`text-xs font-medium ${
            isPositive ? "text-success" : "text-danger"
          }`}
        >
          {isPositive ? "+" : ""}
          {position.pnlPct.toFixed(2)}%
        </Text>
      </View>
    </Animated.View>
  );
}

function TradeRow({ trade, index }: { trade: TradeFeedItem; index: number }) {
  const isBuy = trade.type === "buy";

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(index * 50)}
      className="flex-row items-center px-4 py-3 border-b border-surface-200"
    >
      <View
        className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${
          isBuy ? "bg-success/20" : "bg-danger/20"
        }`}
      >
        <Ionicons
          name={isBuy ? "arrow-down" : "arrow-up"}
          size={14}
          color={isBuy ? "#22c55e" : "#ef4444"}
        />
      </View>
      <View className="flex-1">
        <Text className="text-white font-medium text-sm">
          {isBuy ? "Buy" : "Sell"} {trade.symbol}
        </Text>
        <Text className="text-gray-500 text-xs">
          {trade.traderName} - {trade.timestamp}
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-white text-sm font-medium">
          {trade.quantity} @ ${trade.price.toLocaleString()}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function PortfolioScreen() {
  const [activePeriod, setActivePeriod] = useState<Period>("1M");
  const { data: portfolio } = usePortfolio();
  const periodReturn = PERIOD_RETURNS[activePeriod];

  const handlePeriodChange = useCallback((period: Period) => {
    setActivePeriod(period);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-0" edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-2 pb-1">
          <Text className="text-gray-400 text-sm">Total Portfolio Value</Text>
          <AnimatedCounter value={portfolio?.totalValue ?? 0} />
          <View className="flex-row items-center mt-1">
            <Ionicons
              name={periodReturn.pct >= 0 ? "trending-up" : "trending-down"}
              size={16}
              color={periodReturn.pct >= 0 ? "#22c55e" : "#ef4444"}
            />
            <Text
              className={`ml-1 font-semibold text-sm ${
                periodReturn.pct >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {periodReturn.pct >= 0 ? "+" : ""}$
              {periodReturn.value.toLocaleString()} (
              {periodReturn.pct >= 0 ? "+" : ""}
              {periodReturn.pct.toFixed(2)}%)
            </Text>
            <Text className="text-gray-500 text-xs ml-1">{activePeriod}</Text>
          </View>
        </View>

        {/* Chart */}
        <ChartPlaceholder period={activePeriod} />

        {/* Period Selector */}
        <PeriodSelector active={activePeriod} onSelect={handlePeriodChange} />

        {/* Positions */}
        <View className="mt-6">
          <View className="flex-row items-center justify-between px-4 mb-2">
            <Text className="text-white font-semibold text-lg">Positions</Text>
            <Text className="text-gray-500 text-xs">
              {portfolio?.positions.length ?? 0} assets
            </Text>
          </View>
          <View className="bg-surface-100 rounded-2xl mx-4 border border-surface-200 overflow-hidden">
            {(portfolio?.positions ?? []).map((pos, i) => (
              <PositionRow key={pos.id} position={pos} index={i} />
            ))}
          </View>
        </View>

        {/* Trade Feed */}
        <View className="mt-6 mb-8">
          <View className="flex-row items-center justify-between px-4 mb-2">
            <Text className="text-white font-semibold text-lg">
              Recent Trades
            </Text>
            <Text className="text-gray-500 text-xs">Live feed</Text>
          </View>
          <View className="bg-surface-100 rounded-2xl mx-4 border border-surface-200 overflow-hidden">
            {(portfolio?.trades ?? []).map((trade, i) => (
              <TradeRow key={trade.id} trade={trade} index={i} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
