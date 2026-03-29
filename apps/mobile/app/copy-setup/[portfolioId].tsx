import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
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
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

interface BrokerOption {
  id: string;
  name: string;
  connected: boolean;
  accountType: string;
  buyingPower: number;
}

const MOCK_BROKERS: BrokerOption[] = [
  {
    id: "b1",
    name: "Alpaca",
    connected: true,
    accountType: "Margin",
    buyingPower: 25000,
  },
  {
    id: "b2",
    name: "Coinbase",
    connected: true,
    accountType: "Spot",
    buyingPower: 8500,
  },
  {
    id: "b3",
    name: "OANDA",
    connected: false,
    accountType: "Standard",
    buyingPower: 0,
  },
];

const PORTFOLIO_INFO: Record<string, { name: string; traderName: string; markets: string[] }> = {
  port1: {
    name: "Tech Momentum Alpha",
    traderName: "Alex Morgan",
    markets: ["Stocks"],
  },
  port2: {
    name: "Crypto Swing Trades",
    traderName: "Alex Morgan",
    markets: ["Crypto"],
  },
  port3: {
    name: "Balanced Growth",
    traderName: "Alex Morgan",
    markets: ["Stocks", "Crypto"],
  },
};

function SliderControl({
  label,
  value,
  onValueChange,
  min,
  max,
  step,
  suffix,
  prefix,
  index,
}: {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  prefix?: string;
  index: number;
}) {
  const sliderWidth = useSharedValue(0);
  const progress = useSharedValue((value - min) / (max - min));
  const isDragging = useSharedValue(false);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    left: `${progress.value * 100}%`,
    transform: [
      { translateX: -10 },
      { scale: isDragging.value ? 1.2 : 1 },
    ],
  }));

  const displayValue = useAnimatedStyle(() => {
    return {};
  });

  const updateValue = useCallback(
    (pct: number) => {
      const raw = min + pct * (max - min);
      const stepped = Math.round(raw / step) * step;
      const clamped = Math.max(min, Math.min(max, stepped));
      onValueChange(clamped);
    },
    [min, max, step, onValueChange]
  );

  const gesture = Gesture.Pan()
    .onBegin(() => {
      isDragging.value = true;
    })
    .onUpdate((e) => {
      if (sliderWidth.value > 0) {
        const pct = Math.max(
          0,
          Math.min(1, (e.absoluteX - 16) / sliderWidth.value)
        );
        progress.value = pct;
        runOnJS(updateValue)(pct);
      }
    })
    .onEnd(() => {
      isDragging.value = false;
    })
    .onFinalize(() => {
      isDragging.value = false;
    });

  const tapGesture = Gesture.Tap().onEnd((e) => {
    if (sliderWidth.value > 0) {
      const pct = Math.max(0, Math.min(1, e.absoluteX / sliderWidth.value));
      progress.value = withTiming(pct, {
        duration: TRANSITION_DURATION,
        easing: EASE_OUT_EXPO,
      });
      runOnJS(updateValue)(pct);
    }
  });

  const composed = Gesture.Race(gesture, tapGesture);

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(index * 50)}
      className="mb-6"
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-gray-300 text-sm font-medium">{label}</Text>
        <View className="bg-surface-300 px-3 py-1 rounded-lg">
          <Text className="text-white font-bold text-sm">
            {prefix}
            {value.toLocaleString()}
            {suffix}
          </Text>
        </View>
      </View>

      <GestureDetector gesture={composed}>
        <View
          className="h-10 justify-center"
          onLayout={(e) => {
            sliderWidth.value = e.nativeEvent.layout.width;
          }}
        >
          <View className="h-1.5 bg-surface-400 rounded-full overflow-hidden">
            <Animated.View
              style={fillStyle}
              className="h-full bg-brand-500 rounded-full"
            />
          </View>
          <Animated.View
            style={thumbStyle}
            className="absolute w-5 h-5 bg-white rounded-full shadow-lg"
          />
        </View>
      </GestureDetector>

      <View className="flex-row justify-between mt-1">
        <Text className="text-gray-600 text-xs">
          {prefix}
          {min.toLocaleString()}
          {suffix}
        </Text>
        <Text className="text-gray-600 text-xs">
          {prefix}
          {max.toLocaleString()}
          {suffix}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function CopySetupScreen() {
  const { portfolioId } = useLocalSearchParams<{ portfolioId: string }>();
  const router = useRouter();

  const info = PORTFOLIO_INFO[portfolioId ?? "port1"] ?? PORTFOLIO_INFO.port1;

  const [allocation, setAllocation] = useState(1000);
  const [maxPosition, setMaxPosition] = useState(10);
  const [stopLossEnabled, setStopLossEnabled] = useState(false);
  const [stopLossValue, setStopLossValue] = useState(15);
  const [selectedBroker, setSelectedBroker] = useState<string>("b1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stopLossHeight = useSharedValue(0);
  const stopLossOpacity = useSharedValue(0);

  const stopLossContainerStyle = useAnimatedStyle(() => ({
    height: stopLossHeight.value,
    opacity: stopLossOpacity.value,
    overflow: "hidden" as const,
  }));

  const handleStopLossToggle = (enabled: boolean) => {
    setStopLossEnabled(enabled);
    stopLossHeight.value = withTiming(enabled ? 120 : 0, {
      duration: TRANSITION_DURATION,
      easing: EASE_OUT_EXPO,
    });
    stopLossOpacity.value = withTiming(enabled ? 1 : 0, {
      duration: TRANSITION_DURATION,
      easing: EASE_OUT_EXPO,
    });
  };

  const confirmScale = useSharedValue(1);
  const confirmStyle = useAnimatedStyle(() => ({
    transform: [{ scale: confirmScale.value }],
  }));

  const handleConfirm = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1500));
    setIsSubmitting(false);
    router.back();
  };

  return (
    <View className="flex-1 bg-surface-0">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Handle Bar (modal indicator) */}
        <Animated.View
          entering={FadeIn.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
          className="items-center pt-2 pb-1"
        >
          <View className="w-10 h-1 bg-surface-400 rounded-full" />
        </Animated.View>

        {/* Navigation Bar */}
        <Animated.View
          entering={FadeIn.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
          className="flex-row items-center px-4 py-3"
        >
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 bg-surface-200 rounded-full items-center justify-center"
          >
            <Ionicons name="close" size={20} color="#ffffff" />
          </TouchableOpacity>
          <View className="ml-3 flex-1">
            <Text className="text-white font-semibold text-lg">
              Copy Setup
            </Text>
            <Text className="text-gray-400 text-xs">{info.name}</Text>
          </View>
        </Animated.View>

        <ScrollView
          className="flex-1 px-4"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Portfolio Info */}
          <Animated.View
            entering={FadeInDown.duration(TRANSITION_DURATION).easing(
              EASE_OUT_EXPO
            )}
            className="bg-surface-100 rounded-2xl p-4 border border-surface-200 mb-6"
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-white font-semibold text-base">
                  {info.name}
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  by {info.traderName}
                </Text>
              </View>
              <View className="flex-row gap-1">
                {info.markets.map((m) => (
                  <View
                    key={m}
                    className="bg-surface-300 px-2 py-0.5 rounded-full"
                  >
                    <Text className="text-gray-400 text-xs">{m}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>

          {/* Allocation Slider */}
          <SliderControl
            label="Allocation Amount"
            value={allocation}
            onValueChange={setAllocation}
            min={100}
            max={50000}
            step={100}
            prefix="$"
            index={0}
          />

          {/* Max Position Slider */}
          <SliderControl
            label="Max Position Size"
            value={maxPosition}
            onValueChange={setMaxPosition}
            min={1}
            max={50}
            step={1}
            suffix="%"
            index={1}
          />

          {/* Stop Loss Toggle */}
          <Animated.View
            entering={FadeInDown.duration(TRANSITION_DURATION)
              .easing(EASE_OUT_EXPO)
              .delay(100)}
            className="mb-6"
          >
            <View className="flex-row items-center justify-between mb-2">
              <View>
                <Text className="text-gray-300 text-sm font-medium">
                  Stop Loss
                </Text>
                <Text className="text-gray-600 text-xs mt-0.5">
                  Automatically stop copying at a loss threshold
                </Text>
              </View>
              <Switch
                value={stopLossEnabled}
                onValueChange={handleStopLossToggle}
                trackColor={{ false: "#3d3d3d", true: "#33a5ff" }}
                thumbColor="#ffffff"
              />
            </View>

            <Animated.View style={stopLossContainerStyle}>
              <View className="mt-2">
                <SliderControl
                  label="Stop Loss Threshold"
                  value={stopLossValue}
                  onValueChange={setStopLossValue}
                  min={5}
                  max={50}
                  step={1}
                  suffix="%"
                  prefix="-"
                  index={0}
                />
              </View>
            </Animated.View>
          </Animated.View>

          {/* Broker Selector */}
          <Animated.View
            entering={FadeInDown.duration(TRANSITION_DURATION)
              .easing(EASE_OUT_EXPO)
              .delay(150)}
            className="mb-6"
          >
            <Text className="text-gray-300 text-sm font-medium mb-3">
              Select Broker
            </Text>
            {MOCK_BROKERS.map((broker) => {
              const isSelected = selectedBroker === broker.id;
              return (
                <TouchableOpacity
                  key={broker.id}
                  onPress={() => {
                    if (broker.connected) setSelectedBroker(broker.id);
                    else router.push(`/broker-connect/${broker.name.toLowerCase()}`);
                  }}
                  className={`flex-row items-center p-4 rounded-xl mb-2 border ${
                    isSelected
                      ? "bg-brand-500/10 border-brand-500"
                      : "bg-surface-200 border-surface-300"
                  } ${!broker.connected ? "opacity-50" : ""}`}
                  activeOpacity={0.7}
                >
                  <View
                    className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                      isSelected ? "bg-brand-500/20" : "bg-surface-300"
                    }`}
                  >
                    <Ionicons
                      name="wallet-outline"
                      size={18}
                      color={isSelected ? "#33a5ff" : "#6b7280"}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-medium text-sm">
                      {broker.name}
                    </Text>
                    <Text className="text-gray-500 text-xs">
                      {broker.connected
                        ? `${broker.accountType} - $${broker.buyingPower.toLocaleString()} available`
                        : "Not connected"}
                    </Text>
                  </View>
                  {isSelected && broker.connected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color="#33a5ff"
                    />
                  )}
                  {!broker.connected && (
                    <Text className="text-brand-400 text-xs font-medium">
                      Connect
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* Summary */}
          <Animated.View
            entering={FadeInDown.duration(TRANSITION_DURATION)
              .easing(EASE_OUT_EXPO)
              .delay(200)}
            className="bg-surface-100 rounded-2xl p-4 border border-surface-200 mb-6"
          >
            <Text className="text-white font-semibold text-sm mb-3">
              Summary
            </Text>
            <View className="gap-2">
              <View className="flex-row justify-between">
                <Text className="text-gray-500 text-xs">Portfolio</Text>
                <Text className="text-white text-xs font-medium">
                  {info.name}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-500 text-xs">Allocation</Text>
                <Text className="text-white text-xs font-medium">
                  ${allocation.toLocaleString()}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-500 text-xs">Max Position</Text>
                <Text className="text-white text-xs font-medium">
                  {maxPosition}%
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-500 text-xs">Stop Loss</Text>
                <Text className="text-white text-xs font-medium">
                  {stopLossEnabled ? `-${stopLossValue}%` : "Disabled"}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-500 text-xs">Broker</Text>
                <Text className="text-white text-xs font-medium">
                  {MOCK_BROKERS.find((b) => b.id === selectedBroker)?.name ??
                    "None"}
                </Text>
              </View>
            </View>
          </Animated.View>
        </ScrollView>

        {/* Confirm Button */}
        <Animated.View
          entering={FadeInDown.duration(TRANSITION_DURATION)
            .easing(EASE_OUT_EXPO)
            .delay(250)}
          className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-4 bg-surface-0/90"
        >
          <Animated.View style={confirmStyle}>
            <TouchableOpacity
              onPressIn={() => {
                confirmScale.value = withSpring(0.95, {
                  damping: 15,
                  stiffness: 400,
                });
              }}
              onPressOut={() => {
                confirmScale.value = withSpring(1, {
                  damping: 15,
                  stiffness: 400,
                });
              }}
              onPress={handleConfirm}
              disabled={isSubmitting}
              className={`rounded-2xl py-4 items-center ${
                isSubmitting ? "bg-brand-500/50" : "bg-brand-500"
              }`}
              activeOpacity={1}
            >
              {isSubmitting ? (
                <View className="flex-row items-center">
                  <ActivityIndicator color="#ffffff" size="small" />
                  <Text className="text-white font-bold text-base ml-2">
                    Setting Up...
                  </Text>
                </View>
              ) : (
                <View>
                  <Text className="text-white font-bold text-base text-center">
                    Start Copying
                  </Text>
                  <Text className="text-white/60 text-xs text-center mt-0.5">
                    ${allocation.toLocaleString()} allocation via{" "}
                    {MOCK_BROKERS.find((b) => b.id === selectedBroker)?.name}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
