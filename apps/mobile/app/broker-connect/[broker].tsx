import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  cancelAnimation,
  ZoomIn,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

type ConnectionState = "idle" | "connecting" | "success" | "error";

type ConnectionType = "oauth" | "api_token" | "wallet_key";

interface BrokerInfo {
  name: string;
  description: string;
  features: string[];
  markets: string[];
  connectionType: ConnectionType;
  oauthUrl: string;
}

const BROKER_INFO: Record<string, BrokerInfo> = {
  alpaca: {
    name: "Alpaca",
    description:
      "Commission-free trading API for US stocks and ETFs. Supports margin accounts with real-time market data.",
    features: [
      "Commission-free US stock trading",
      "Fractional shares support",
      "Real-time market data",
      "Margin accounts available",
    ],
    markets: ["Stocks", "ETFs"],
    connectionType: "oauth",
    oauthUrl: "https://app.alpaca.markets/oauth/authorize",
  },
  coinbase: {
    name: "Coinbase",
    description:
      "Leading cryptocurrency exchange with 200+ supported assets. Secure custody and instant trading.",
    features: [
      "200+ cryptocurrencies",
      "Instant buy/sell",
      "Insured custody",
      "Advanced order types",
    ],
    markets: ["Crypto"],
    connectionType: "oauth",
    oauthUrl: "https://www.coinbase.com/oauth/authorize",
  },
  oanda: {
    name: "OANDA",
    description:
      "Award-winning forex broker with tight spreads and advanced charting tools.",
    features: [
      "70+ currency pairs",
      "Tight spreads from 0.6 pips",
      "Advanced charting",
      "Risk management tools",
    ],
    markets: ["Forex"],
    connectionType: "api_token",
    oauthUrl: "",
  },
  "interactive-brokers": {
    name: "Interactive Brokers",
    description:
      "Global multi-asset broker with access to stocks, options, futures, forex, and more across 150 markets.",
    features: [
      "150+ global markets",
      "Stocks, options, futures, forex",
      "Low margin rates",
      "Professional-grade tools",
    ],
    markets: ["Stocks", "Options", "Futures", "Forex"],
    connectionType: "oauth",
    oauthUrl: "https://www.interactivebrokers.com/oauth",
  },
  polymarket: {
    name: "Polymarket",
    description:
      "Decentralized prediction market platform for trading on real-world event outcomes using USDC on Polygon.",
    features: [
      "Binary & multi-outcome markets",
      "USDC settlement on Polygon",
      "Political, sports & current events",
      "No KYC required",
    ],
    markets: ["Prediction Markets"],
    connectionType: "wallet_key",
    oauthUrl: "",
  },
  new: {
    name: "Add Broker",
    description: "Connect a new brokerage account to start copy trading.",
    features: [],
    markets: [],
    connectionType: "oauth",
    oauthUrl: "",
  },
};

const DEFAULT_BROKER: BrokerInfo = {
  name: "Unknown Broker",
  description: "Connect this broker to enable copy trading.",
  features: ["Automated trade execution", "Portfolio sync"],
  markets: [],
  connectionType: "oauth",
  oauthUrl: "",
};

function LoadingIndicator() {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1,
      false
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 500, easing: EASE_OUT_EXPO }),
        withTiming(1.0, { duration: 500, easing: EASE_OUT_EXPO })
      ),
      -1,
      true
    );

    return () => {
      cancelAnimation(rotation);
      cancelAnimation(scale);
    };
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={spinStyle} className="w-16 h-16 items-center justify-center">
      <View className="w-16 h-16 rounded-full border-4 border-surface-400 border-t-brand-500" />
    </Animated.View>
  );
}

function SuccessIndicator() {
  return (
    <Animated.View
      entering={ZoomIn.duration(400).easing(EASE_OUT_EXPO)}
      className="w-20 h-20 bg-success/20 rounded-full items-center justify-center"
    >
      <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
    </Animated.View>
  );
}

function ErrorIndicator() {
  return (
    <Animated.View
      entering={ZoomIn.duration(400).easing(EASE_OUT_EXPO)}
      className="w-20 h-20 bg-danger/20 rounded-full items-center justify-center"
    >
      <Ionicons name="close-circle" size={48} color="#ef4444" />
    </Animated.View>
  );
}

function BrokerListScreen({
  onSelect,
}: {
  onSelect: (broker: string) => void;
}) {
  const brokers = Object.entries(BROKER_INFO).filter(
    ([key]) => key !== "new"
  );

  return (
    <View className="px-4">
      <Animated.View
        entering={FadeInDown.duration(TRANSITION_DURATION).easing(
          EASE_OUT_EXPO
        )}
        className="mb-6"
      >
        <Text className="text-white font-bold text-xl">
          Choose a Broker
        </Text>
        <Text className="text-gray-400 text-sm mt-1">
          Connect your brokerage account to enable copy trading
        </Text>
      </Animated.View>

      {brokers.map(([key, info], index) => (
        <Animated.View
          key={key}
          entering={FadeInDown.duration(TRANSITION_DURATION)
            .easing(EASE_OUT_EXPO)
            .delay(index * 50)}
        >
          <TouchableOpacity
            onPress={() => onSelect(key)}
            className="bg-surface-100 rounded-2xl p-4 border border-surface-200 mb-3"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-surface-300 rounded-full items-center justify-center mr-3">
                <Ionicons
                  name="business-outline"
                  size={20}
                  color="#9ca3af"
                />
              </View>
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">
                  {info.name}
                </Text>
                <Text className="text-gray-500 text-xs mt-0.5">
                  {info.markets.join(" / ")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </View>
          </TouchableOpacity>
        </Animated.View>
      ))}
    </View>
  );
}

export default function BrokerConnectScreen() {
  const { broker } = useLocalSearchParams<{ broker: string }>();
  const router = useRouter();
  const isNewBroker = broker === "new";
  const brokerInfo = BROKER_INFO[broker ?? ""] ?? DEFAULT_BROKER;

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [selectedBroker, setSelectedBroker] = useState<string | null>(
    isNewBroker ? null : broker ?? null
  );

  // OANDA API token form state
  const [oandaAccessToken, setOandaAccessToken] = useState("");
  const [oandaAccountId, setOandaAccountId] = useState("");

  // Polymarket wallet key form state
  const [walletPrivateKey, setWalletPrivateKey] = useState("");

  const handleConnect = async () => {
    setConnectionState("connecting");

    // Simulate OAuth flow
    await new Promise((r) => setTimeout(r, 2500));

    // 90% chance of success for demo
    const success = Math.random() > 0.1;
    setConnectionState(success ? "success" : "error");

    if (success) {
      setTimeout(() => {
        router.back();
      }, 1500);
    }
  };

  const handleRetry = () => {
    setConnectionState("idle");
  };

  const handleBrokerSelect = (brokerId: string) => {
    setSelectedBroker(brokerId);
  };

  const activeBrokerInfo =
    selectedBroker ? (BROKER_INFO[selectedBroker] ?? DEFAULT_BROKER) : brokerInfo;

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
            {isNewBroker && !selectedBroker
              ? "Add Broker"
              : `Connect ${activeBrokerInfo.name}`}
          </Text>
        </Animated.View>

        {/* Broker List for "new" */}
        {isNewBroker && !selectedBroker ? (
          <BrokerListScreen onSelect={handleBrokerSelect} />
        ) : connectionState === "idle" ? (
          /* Broker Detail / Connect Prompt */
          <View className="flex-1 px-4">
            <Animated.View
              entering={FadeInDown.duration(TRANSITION_DURATION).easing(
                EASE_OUT_EXPO
              )}
              className="items-center mb-6 mt-4"
            >
              <View className="w-20 h-20 bg-surface-200 rounded-full items-center justify-center mb-4">
                <Ionicons
                  name="business-outline"
                  size={32}
                  color="#33a5ff"
                />
              </View>
              <Text className="text-white font-bold text-xl">
                {activeBrokerInfo.name}
              </Text>
              <Text className="text-gray-400 text-sm text-center mt-2 px-4">
                {activeBrokerInfo.description}
              </Text>
            </Animated.View>

            {/* Markets */}
            {activeBrokerInfo.markets.length > 0 && (
              <Animated.View
                entering={FadeInDown.duration(TRANSITION_DURATION)
                  .easing(EASE_OUT_EXPO)
                  .delay(50)}
                className="flex-row justify-center gap-2 mb-6"
              >
                {activeBrokerInfo.markets.map((m) => (
                  <View
                    key={m}
                    className="bg-surface-200 px-3 py-1.5 rounded-full"
                  >
                    <Text className="text-gray-300 text-xs">{m}</Text>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* Features */}
            <Animated.View
              entering={FadeInDown.duration(TRANSITION_DURATION)
                .easing(EASE_OUT_EXPO)
                .delay(100)}
              className="bg-surface-100 rounded-2xl p-4 border border-surface-200 mb-6"
            >
              <Text className="text-white font-semibold text-sm mb-3">
                Features
              </Text>
              {activeBrokerInfo.features.map((feature, i) => (
                <View key={i} className="flex-row items-center mb-2">
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color="#22c55e"
                  />
                  <Text className="text-gray-300 text-sm ml-2">
                    {feature}
                  </Text>
                </View>
              ))}
            </Animated.View>

            {/* Security Note */}
            <Animated.View
              entering={FadeInDown.duration(TRANSITION_DURATION)
                .easing(EASE_OUT_EXPO)
                .delay(150)}
              className="flex-row items-start bg-surface-100 rounded-2xl p-4 border border-surface-200 mb-6"
            >
              <Ionicons
                name="shield-checkmark"
                size={20}
                color="#33a5ff"
                style={{ marginRight: 12, marginTop: 2 }}
              />
              <View className="flex-1">
                <Text className="text-white font-medium text-sm">
                  Secure Connection
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  We use OAuth 2.0 to securely connect to your broker. We never
                  store your broker credentials. You can revoke access at any
                  time.
                </Text>
              </View>
            </Animated.View>

            {/* Connect Button */}
            <Animated.View
              entering={FadeInDown.duration(TRANSITION_DURATION)
                .easing(EASE_OUT_EXPO)
                .delay(200)}
            >
              <TouchableOpacity
                onPress={handleConnect}
                className="bg-brand-500 rounded-2xl py-4 items-center"
                activeOpacity={0.8}
              >
                <Text className="text-white font-bold text-base">
                  Connect {activeBrokerInfo.name}
                </Text>
                <Text className="text-white/60 text-xs mt-0.5">
                  You'll be redirected to authorize
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : (
          /* Connection States */
          <View className="flex-1 items-center justify-center px-8">
            {connectionState === "connecting" && (
              <Animated.View
                entering={FadeIn.duration(TRANSITION_DURATION).easing(
                  EASE_OUT_EXPO
                )}
                className="items-center"
              >
                <LoadingIndicator />
                <Text className="text-white font-semibold text-lg mt-6">
                  Connecting to {activeBrokerInfo.name}
                </Text>
                <Text className="text-gray-400 text-sm text-center mt-2">
                  Completing OAuth authorization...
                </Text>
              </Animated.View>
            )}

            {connectionState === "success" && (
              <Animated.View
                entering={FadeIn.duration(TRANSITION_DURATION).easing(
                  EASE_OUT_EXPO
                )}
                className="items-center"
              >
                <SuccessIndicator />
                <Text className="text-white font-semibold text-lg mt-6">
                  Connected Successfully
                </Text>
                <Text className="text-gray-400 text-sm text-center mt-2">
                  {activeBrokerInfo.name} is now linked to your Copy Cat
                  account. Redirecting...
                </Text>
              </Animated.View>
            )}

            {connectionState === "error" && (
              <Animated.View
                entering={FadeIn.duration(TRANSITION_DURATION).easing(
                  EASE_OUT_EXPO
                )}
                className="items-center"
              >
                <ErrorIndicator />
                <Text className="text-white font-semibold text-lg mt-6">
                  Connection Failed
                </Text>
                <Text className="text-gray-400 text-sm text-center mt-2">
                  Unable to connect to {activeBrokerInfo.name}. Please check
                  your credentials and try again.
                </Text>
                <View className="flex-row gap-3 mt-6">
                  <TouchableOpacity
                    onPress={handleRetry}
                    className="bg-brand-500 rounded-xl px-6 py-3"
                  >
                    <Text className="text-white font-semibold text-sm">
                      Try Again
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.back()}
                    className="bg-surface-300 rounded-xl px-6 py-3"
                  >
                    <Text className="text-gray-300 font-semibold text-sm">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
