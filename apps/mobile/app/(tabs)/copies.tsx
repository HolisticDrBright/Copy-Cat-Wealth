import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  Easing,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

interface CopyItem {
  id: string;
  portfolioName: string;
  traderName: string;
  traderAvatar: string;
  allocationAmount: number;
  totalPnl: number;
  totalPnlPct: number;
  todayPnl: number;
  todayPnlPct: number;
  tradesCopied: number;
  todayTrades: number;
  status: "active" | "paused" | "stopped";
  copyRatio: number;
  maxPositionPct: number;
  stopLossPct: number | null;
  markets: string[];
}

const MOCK_COPIES: CopyItem[] = [
  {
    id: "c1",
    portfolioName: "Tech Momentum Alpha",
    traderName: "Alex Morgan",
    traderAvatar: "https://i.pravatar.cc/150?u=alex",
    allocationAmount: 5000,
    totalPnl: 1245.5,
    totalPnlPct: 24.91,
    todayPnl: 87.3,
    todayPnlPct: 1.4,
    tradesCopied: 47,
    todayTrades: 3,
    status: "active",
    copyRatio: 1,
    maxPositionPct: 10,
    stopLossPct: 15,
    markets: ["Stocks", "Crypto"],
  },
  {
    id: "c2",
    portfolioName: "DeFi Degen Plays",
    traderName: "Marcus Webb",
    traderAvatar: "https://i.pravatar.cc/150?u=marcus",
    allocationAmount: 2000,
    totalPnl: -312.8,
    totalPnlPct: -15.64,
    todayPnl: -45.2,
    todayPnlPct: -2.67,
    tradesCopied: 23,
    todayTrades: 1,
    status: "active",
    copyRatio: 0.5,
    maxPositionPct: 20,
    stopLossPct: 25,
    markets: ["Crypto"],
  },
  {
    id: "c3",
    portfolioName: "Conservative FX",
    traderName: "Elena Rodriguez",
    traderAvatar: "https://i.pravatar.cc/150?u=elena",
    allocationAmount: 10000,
    totalPnl: 890.0,
    totalPnlPct: 8.9,
    todayPnl: 12.5,
    todayPnlPct: 0.11,
    tradesCopied: 156,
    todayTrades: 0,
    status: "paused",
    copyRatio: 1,
    maxPositionPct: 5,
    stopLossPct: 10,
    markets: ["Forex"],
  },
  {
    id: "c4",
    portfolioName: "Quant Multi-Asset",
    traderName: "Nina Patel",
    traderAvatar: "https://i.pravatar.cc/150?u=nina",
    allocationAmount: 3000,
    totalPnl: 567.2,
    totalPnlPct: 18.91,
    todayPnl: 23.4,
    todayPnlPct: 0.67,
    tradesCopied: 89,
    todayTrades: 5,
    status: "active",
    copyRatio: 0.75,
    maxPositionPct: 8,
    stopLossPct: null,
    markets: ["Stocks", "Crypto"],
  },
];

function useCopies() {
  return useQuery({
    queryKey: ["copies"],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 400));
      return MOCK_COPIES;
    },
  });
}

function CopyCardItem({
  item,
  index,
  onToggle,
}: {
  item: CopyItem;
  index: number;
  onToggle: (id: string, active: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = item.status === "active";
  const isPositive = item.totalPnl >= 0;
  const isTodayPositive = item.todayPnl >= 0;

  const bgProgress = useSharedValue(isActive ? 1 : 0);
  const animatedBg = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      bgProgress.value,
      [0, 1],
      ["rgba(45, 45, 45, 1)", "rgba(20, 20, 20, 1)"]
    );
    return { backgroundColor };
  });

  const handleToggle = (value: boolean) => {
    bgProgress.value = withTiming(value ? 1 : 0, {
      duration: TRANSITION_DURATION,
      easing: EASE_OUT_EXPO,
    });
    onToggle(item.id, value);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(index * 50)}
      layout={Layout.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
    >
      <Animated.View
        style={animatedBg}
        className="mx-4 mb-3 rounded-2xl border border-surface-200 overflow-hidden"
      >
        <TouchableOpacity
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
          className="p-4"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-white font-semibold text-base">
                {item.portfolioName}
              </Text>
              <Text className="text-gray-400 text-xs mt-0.5">
                by {item.traderName}
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={handleToggle}
              trackColor={{ false: "#3d3d3d", true: "#22c55e" }}
              thumbColor="#ffffff"
            />
          </View>

          {/* Stats */}
          <View className="flex-row mt-3 justify-between">
            <View>
              <Text className="text-gray-500 text-xs">Allocation</Text>
              <Text className="text-white font-medium text-sm">
                ${item.allocationAmount.toLocaleString()}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-gray-500 text-xs">Total PnL</Text>
              <Text
                className={`font-bold text-sm ${
                  isPositive ? "text-success" : "text-danger"
                }`}
              >
                {isPositive ? "+" : ""}$
                {Math.abs(item.totalPnl).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-gray-500 text-xs">Today</Text>
              <Text
                className={`font-medium text-sm ${
                  isTodayPositive ? "text-success" : "text-danger"
                }`}
              >
                {isTodayPositive ? "+" : ""}
                {item.todayPnlPct.toFixed(2)}%
              </Text>
            </View>
          </View>

          {/* Market Badges */}
          <View className="flex-row mt-2 gap-1">
            {item.markets.map((m) => (
              <View
                key={m}
                className="bg-surface-300 px-2 py-0.5 rounded-full"
              >
                <Text className="text-gray-400 text-xs">{m}</Text>
              </View>
            ))}
            <View className="flex-1" />
            <Text className="text-gray-500 text-xs self-center">
              {item.todayTrades} trade{item.todayTrades !== 1 ? "s" : ""} today
            </Text>
          </View>

          {/* Expanded Details */}
          {expanded && (
            <Animated.View
              layout={Layout.duration(TRANSITION_DURATION).easing(
                EASE_OUT_EXPO
              )}
              className="mt-3 pt-3 border-t border-surface-300"
            >
              <View className="flex-row justify-between">
                <View>
                  <Text className="text-gray-500 text-xs">Copy Ratio</Text>
                  <Text className="text-white font-medium text-sm">
                    {(item.copyRatio * 100).toFixed(0)}%
                  </Text>
                </View>
                <View className="items-center">
                  <Text className="text-gray-500 text-xs">Max Position</Text>
                  <Text className="text-white font-medium text-sm">
                    {item.maxPositionPct}%
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-gray-500 text-xs">Trades Copied</Text>
                  <Text className="text-white font-medium text-sm">
                    {item.tradesCopied}
                  </Text>
                </View>
              </View>
              {item.stopLossPct !== null && (
                <View className="mt-2">
                  <Text className="text-gray-500 text-xs">Stop Loss</Text>
                  <Text className="text-danger font-medium text-sm">
                    -{item.stopLossPct}%
                  </Text>
                </View>
              )}
              <Text className="mt-2 text-xs text-gray-600">
                Status: {item.status}
              </Text>
            </Animated.View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

export default function CopiesScreen() {
  const { data: copies, isLoading, refetch, isRefetching } = useCopies();
  const queryClient = useQueryClient();

  const handleToggle = useCallback((id: string, active: boolean) => {
    // In real app, this would call an API mutation
    queryClient.setQueryData<CopyItem[]>(["copies"], (old) =>
      old?.map((c) =>
        c.id === id ? { ...c, status: active ? "active" : "paused" } : c
      )
    );
  }, []);

  const totalAllocation = copies?.reduce(
    (sum, c) => sum + c.allocationAmount,
    0
  ) ?? 0;
  const totalPnl = copies?.reduce((sum, c) => sum + c.totalPnl, 0) ?? 0;
  const activeCopies = copies?.filter((c) => c.status === "active").length ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-surface-0" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <Text className="text-white text-2xl font-bold">My Copies</Text>
        <Text className="text-gray-400 text-sm mt-1">
          {activeCopies} active cop{activeCopies !== 1 ? "ies" : "y"}
        </Text>
      </View>

      {/* Summary Bar */}
      <Animated.View
        entering={FadeInDown.duration(TRANSITION_DURATION).easing(
          EASE_OUT_EXPO
        )}
        className="mx-4 mb-4 bg-surface-100 rounded-2xl p-4 border border-surface-200"
      >
        <View className="flex-row justify-between">
          <View>
            <Text className="text-gray-500 text-xs">Total Allocated</Text>
            <Text className="text-white font-bold text-lg">
              ${totalAllocation.toLocaleString()}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-gray-500 text-xs">Total PnL</Text>
            <Text
              className={`font-bold text-lg ${
                totalPnl >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {totalPnl >= 0 ? "+" : ""}$
              {Math.abs(totalPnl).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Copy List */}
      <FlatList
        data={copies ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <CopyCardItem item={item} index={index} onToggle={handleToggle} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#33a5ff"
          />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center mt-16 px-8">
              <Ionicons name="copy-outline" size={48} color="#3d3d3d" />
              <Text className="text-gray-500 text-base mt-4 text-center">
                You haven't copied any traders yet
              </Text>
              <Text className="text-gray-600 text-sm mt-2 text-center">
                Head to Discover to find traders to copy
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
