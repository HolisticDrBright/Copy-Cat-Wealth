import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeIn,
  Easing,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

interface TraderProfile {
  id: string;
  name: string;
  avatar: string;
  description: string;
  bio: string;
  winRate: number;
  totalReturn: number;
  monthlyReturn: number;
  maxDrawdown: number;
  copiers: number;
  totalTrades: number;
  avgTradeSize: number;
  riskScore: number;
  markets: string[];
  joinedDate: string;
  sharpeRatio: number;
  profitFactor: number;
}

interface Portfolio {
  id: string;
  name: string;
  description: string;
  return: number;
  copiers: number;
  riskLevel: string;
  markets: string[];
}

interface RecentTrade {
  id: string;
  type: "buy" | "sell";
  symbol: string;
  price: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  timestamp: string;
}

const MOCK_TRADERS: Record<string, TraderProfile> = {
  "1": {
    id: "1",
    name: "Alex Morgan",
    avatar: "https://i.pravatar.cc/150?u=alex",
    description: "Momentum & swing trader focused on tech and crypto markets",
    bio: "Former quantitative analyst at Goldman Sachs. 8+ years of trading experience across equities and digital assets. My strategy combines technical analysis with fundamental catalysts to identify high-conviction momentum plays.",
    winRate: 72.4,
    totalReturn: 184.5,
    monthlyReturn: 8.2,
    maxDrawdown: 12.3,
    copiers: 2341,
    totalTrades: 847,
    avgTradeSize: 2500,
    riskScore: 3,
    markets: ["Stocks", "Crypto"],
    joinedDate: "Jan 2024",
    sharpeRatio: 2.14,
    profitFactor: 2.87,
  },
  "2": {
    id: "2",
    name: "Sarah Chen",
    avatar: "https://i.pravatar.cc/150?u=sarah",
    description: "Value investor with a focus on dividend aristocrats",
    bio: "CFA charterholder with 12 years in asset management. Focused on identifying undervalued dividend growth stocks for long-term compounding.",
    winRate: 68.1,
    totalReturn: 142.3,
    monthlyReturn: 5.7,
    maxDrawdown: 8.1,
    copiers: 1856,
    totalTrades: 312,
    avgTradeSize: 5000,
    riskScore: 2,
    markets: ["Stocks"],
    joinedDate: "Mar 2024",
    sharpeRatio: 1.89,
    profitFactor: 2.31,
  },
};

const DEFAULT_TRADER: TraderProfile = {
  id: "0",
  name: "Unknown Trader",
  avatar: "https://i.pravatar.cc/150?u=default",
  description: "Trader profile",
  bio: "No bio available.",
  winRate: 50,
  totalReturn: 0,
  monthlyReturn: 0,
  maxDrawdown: 0,
  copiers: 0,
  totalTrades: 0,
  avgTradeSize: 0,
  riskScore: 3,
  markets: [],
  joinedDate: "Unknown",
  sharpeRatio: 0,
  profitFactor: 0,
};

const MOCK_PORTFOLIOS: Portfolio[] = [
  {
    id: "port1",
    name: "Tech Momentum Alpha",
    description: "High-conviction tech & semiconductor plays",
    return: 42.5,
    copiers: 1205,
    riskLevel: "Medium",
    markets: ["Stocks"],
  },
  {
    id: "port2",
    name: "Crypto Swing Trades",
    description: "BTC/ETH and select altcoin swing positions",
    return: 87.3,
    copiers: 890,
    riskLevel: "High",
    markets: ["Crypto"],
  },
  {
    id: "port3",
    name: "Balanced Growth",
    description: "Diversified multi-asset with lower volatility",
    return: 28.1,
    copiers: 456,
    riskLevel: "Low",
    markets: ["Stocks", "Crypto"],
  },
];

const MOCK_RECENT_TRADES: RecentTrade[] = [
  {
    id: "rt1",
    type: "buy",
    symbol: "NVDA",
    price: 918.5,
    quantity: 10,
    pnl: 245.0,
    pnlPct: 2.67,
    timestamp: "2 hr ago",
  },
  {
    id: "rt2",
    type: "sell",
    symbol: "AAPL",
    price: 195.2,
    quantity: 20,
    pnl: 180.0,
    pnlPct: 4.83,
    timestamp: "5 hr ago",
  },
  {
    id: "rt3",
    type: "buy",
    symbol: "BTC",
    price: 67200,
    quantity: 0.15,
    pnl: -120.0,
    pnlPct: -1.19,
    timestamp: "1 day ago",
  },
  {
    id: "rt4",
    type: "sell",
    symbol: "ETH",
    price: 3480,
    quantity: 2.0,
    pnl: 560.0,
    pnlPct: 8.75,
    timestamp: "1 day ago",
  },
  {
    id: "rt5",
    type: "buy",
    symbol: "AMZN",
    price: 185.6,
    quantity: 15,
    pnl: 67.5,
    pnlPct: 2.42,
    timestamp: "2 days ago",
  },
];

function useTrader(id: string) {
  return useQuery({
    queryKey: ["trader", id],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 300));
      return MOCK_TRADERS[id] ?? { ...DEFAULT_TRADER, id };
    },
  });
}

function StatBox({
  label,
  value,
  valueColor,
  index,
}: {
  label: string;
  value: string;
  valueColor?: string;
  index: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(100 + index * 30)}
      className="bg-surface-200 rounded-xl p-3 flex-1"
    >
      <Text className="text-gray-500 text-xs mb-1">{label}</Text>
      <Text className={`font-bold text-sm ${valueColor ?? "text-white"}`}>
        {value}
      </Text>
    </Animated.View>
  );
}

function RiskMeter({ score }: { score: number }) {
  const bars = [1, 2, 3, 4, 5];
  return (
    <View className="flex-row gap-1 items-center">
      {bars.map((bar) => (
        <View
          key={bar}
          className={`h-3 w-3 rounded-sm ${
            bar <= score
              ? score <= 2
                ? "bg-green-500"
                : score <= 3
                ? "bg-yellow-500"
                : "bg-red-500"
              : "bg-surface-400"
          }`}
        />
      ))}
      <Text className="text-gray-400 text-xs ml-1">
        {score <= 2 ? "Low" : score <= 3 ? "Medium" : "High"}
      </Text>
    </View>
  );
}

function PortfolioCard({
  portfolio,
  index,
  onCopy,
}: {
  portfolio: Portfolio;
  index: number;
  onCopy: (id: string) => void;
}) {
  const isPositive = portfolio.return >= 0;
  const riskColor =
    portfolio.riskLevel === "Low"
      ? "text-green-400"
      : portfolio.riskLevel === "Medium"
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(200 + index * 50)}
      layout={Layout.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
      className="bg-surface-200 rounded-xl p-4 mb-3"
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-white font-semibold text-sm">
            {portfolio.name}
          </Text>
          <Text className="text-gray-400 text-xs mt-0.5">
            {portfolio.description}
          </Text>
        </View>
        <Text
          className={`font-bold text-base ${
            isPositive ? "text-success" : "text-danger"
          }`}
        >
          {isPositive ? "+" : ""}
          {portfolio.return}%
        </Text>
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Text className={`text-xs font-medium ${riskColor}`}>
            {portfolio.riskLevel} Risk
          </Text>
          <Text className="text-gray-500 text-xs">
            {portfolio.copiers.toLocaleString()} copiers
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onCopy(portfolio.id)}
          className="bg-brand-500 px-4 py-1.5 rounded-lg"
        >
          <Text className="text-white text-xs font-semibold">Copy</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row mt-2 gap-1">
        {portfolio.markets.map((m) => (
          <View key={m} className="bg-surface-300 px-2 py-0.5 rounded-full">
            <Text className="text-gray-400 text-xs">{m}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function TradeItem({
  trade,
  index,
}: {
  trade: RecentTrade;
  index: number;
}) {
  const isBuy = trade.type === "buy";
  const isPositive = trade.pnl >= 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(300 + index * 50)}
      className="flex-row items-center py-3 border-b border-surface-300"
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
          {trade.quantity} @ ${trade.price.toLocaleString()} - {trade.timestamp}
        </Text>
      </View>
      <View className="items-end">
        <Text
          className={`font-semibold text-sm ${
            isPositive ? "text-success" : "text-danger"
          }`}
        >
          {isPositive ? "+" : ""}${Math.abs(trade.pnl).toLocaleString()}
        </Text>
        <Text
          className={`text-xs ${
            isPositive ? "text-success" : "text-danger"
          }`}
        >
          {isPositive ? "+" : ""}
          {trade.pnlPct.toFixed(2)}%
        </Text>
      </View>
    </Animated.View>
  );
}

export default function TraderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: trader } = useTrader(id ?? "0");

  const ctaScale = useSharedValue(1);
  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  const handleCtaPressIn = () => {
    ctaScale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handleCtaPressOut = () => {
    ctaScale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handleCopyPortfolio = (portfolioId: string) => {
    router.push(`/copy-setup/${portfolioId}`);
  };

  if (!trader) return null;

  const riskLabel =
    trader.riskScore <= 2 ? "Low" : trader.riskScore <= 3 ? "Medium" : "High";

  return (
    <View className="flex-1 bg-surface-0">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Navigation Bar */}
        <Animated.View
          entering={FadeIn.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
          className="flex-row items-center px-4 py-3"
        >
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 bg-surface-200 rounded-full items-center justify-center"
          >
            <Ionicons name="arrow-back" size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text className="text-white font-semibold text-lg ml-3 flex-1">
            Trader Profile
          </Text>
          <TouchableOpacity className="w-10 h-10 bg-surface-200 rounded-full items-center justify-center">
            <Ionicons name="share-outline" size={18} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* Profile Header */}
          <Animated.View
            entering={FadeInDown.duration(TRANSITION_DURATION).easing(
              EASE_OUT_EXPO
            )}
            className="items-center px-4 pb-4"
          >
            <Image
              source={{ uri: trader.avatar }}
              className="w-20 h-20 rounded-full bg-surface-300"
            />
            <Text className="text-white font-bold text-xl mt-3">
              {trader.name}
            </Text>
            <Text className="text-gray-400 text-sm text-center mt-1 px-8">
              {trader.description}
            </Text>
            <View className="flex-row items-center gap-2 mt-2">
              {trader.markets.map((m) => (
                <View
                  key={m}
                  className="bg-surface-300 px-3 py-1 rounded-full"
                >
                  <Text className="text-gray-300 text-xs">{m}</Text>
                </View>
              ))}
              <Text className="text-gray-600 text-xs">
                Since {trader.joinedDate}
              </Text>
            </View>
          </Animated.View>

          {/* Bio */}
          <Animated.View
            entering={FadeInDown.duration(TRANSITION_DURATION)
              .easing(EASE_OUT_EXPO)
              .delay(50)}
            className="mx-4 mb-4 bg-surface-100 rounded-2xl p-4 border border-surface-200"
          >
            <Text className="text-gray-300 text-sm leading-5">
              {trader.bio}
            </Text>
          </Animated.View>

          {/* Stats Grid */}
          <View className="px-4 mb-4">
            <View className="flex-row gap-2 mb-2">
              <StatBox
                label="Win Rate"
                value={`${trader.winRate}%`}
                index={0}
              />
              <StatBox
                label="Total Return"
                value={`+${trader.totalReturn}%`}
                valueColor="text-success"
                index={1}
              />
              <StatBox
                label="Monthly"
                value={`+${trader.monthlyReturn}%`}
                valueColor="text-success"
                index={2}
              />
            </View>
            <View className="flex-row gap-2 mb-2">
              <StatBox
                label="Max Drawdown"
                value={`-${trader.maxDrawdown}%`}
                valueColor="text-danger"
                index={3}
              />
              <StatBox
                label="Sharpe Ratio"
                value={trader.sharpeRatio.toFixed(2)}
                index={4}
              />
              <StatBox
                label="Profit Factor"
                value={trader.profitFactor.toFixed(2)}
                index={5}
              />
            </View>
            <View className="flex-row gap-2">
              <StatBox
                label="Copiers"
                value={trader.copiers.toLocaleString()}
                index={6}
              />
              <StatBox
                label="Total Trades"
                value={trader.totalTrades.toLocaleString()}
                index={7}
              />
              <StatBox
                label="Avg Trade"
                value={`$${trader.avgTradeSize.toLocaleString()}`}
                index={8}
              />
            </View>
          </View>

          {/* Risk */}
          <Animated.View
            entering={FadeInDown.duration(TRANSITION_DURATION)
              .easing(EASE_OUT_EXPO)
              .delay(150)}
            className="mx-4 mb-4 bg-surface-100 rounded-2xl p-4 border border-surface-200"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-white font-semibold text-sm">
                Risk Level
              </Text>
              <RiskMeter score={trader.riskScore} />
            </View>
          </Animated.View>

          {/* Portfolios */}
          <View className="px-4 mb-4">
            <Text className="text-white font-semibold text-lg mb-3">
              Portfolios
            </Text>
            {MOCK_PORTFOLIOS.map((p, i) => (
              <PortfolioCard
                key={p.id}
                portfolio={p}
                index={i}
                onCopy={handleCopyPortfolio}
              />
            ))}
          </View>

          {/* Recent Trades */}
          <View className="px-4 mb-4">
            <Text className="text-white font-semibold text-lg mb-2">
              Recent Trades
            </Text>
            <View className="bg-surface-100 rounded-2xl px-4 border border-surface-200 overflow-hidden">
              {MOCK_RECENT_TRADES.map((trade, i) => (
                <TradeItem key={trade.id} trade={trade} index={i} />
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Fixed CTA */}
        <Animated.View
          entering={FadeInDown.duration(TRANSITION_DURATION)
            .easing(EASE_OUT_EXPO)
            .delay(400)}
          className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-4 bg-surface-0/90"
        >
          <Animated.View style={ctaStyle}>
            <TouchableOpacity
              onPressIn={handleCtaPressIn}
              onPressOut={handleCtaPressOut}
              onPress={() => handleCopyPortfolio(MOCK_PORTFOLIOS[0].id)}
              className="bg-brand-500 rounded-2xl py-4 items-center"
              activeOpacity={1}
            >
              <Text className="text-white font-bold text-base">
                Copy This Trader
              </Text>
              <Text className="text-white/60 text-xs mt-0.5">
                Choose a portfolio to start copying
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
