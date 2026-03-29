import { Pressable, Text, View, Modal } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Layout,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import type { SubscriptionTier } from "@copy-cat/shared";

const TRANSITION_CONFIG = {
  duration: 250,
  easing: Easing.bezier(0.19, 1, 0.22, 1),
};

interface TierFeature {
  label: string;
  free: boolean | string;
  pro: boolean | string;
  elite: boolean | string;
}

const TIER_FEATURES: TierFeature[] = [
  { label: "Copy traders", free: "1", pro: "5", elite: "Unlimited" },
  { label: "Max allocation", free: "$500", pro: "$25K", elite: "Unlimited" },
  { label: "Markets", free: "Stocks", pro: "All", elite: "All" },
  { label: "Real-time alerts", free: false, pro: true, elite: true },
  { label: "Advanced analytics", free: false, pro: true, elite: true },
  { label: "Priority execution", free: false, pro: false, elite: true },
  { label: "API access", free: false, pro: false, elite: true },
];

const TIER_PRICING: Record<string, { monthly: string; label: string }> = {
  pro: { monthly: "$19.99", label: "Pro" },
  elite: { monthly: "$49.99", label: "Elite" },
};

interface SubscriptionPaywallProps {
  visible: boolean;
  onClose: () => void;
  onSelectTier: (tier: SubscriptionTier) => void;
  currentTier?: SubscriptionTier;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SubscriptionPaywall({
  visible,
  onClose,
  onSelectTier,
  currentTier = "free",
}: SubscriptionPaywallProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60">
        {/* Backdrop tap to close */}
        {visible && (
          <Animated.View
            entering={FadeIn.duration(TRANSITION_CONFIG.duration).easing(
              TRANSITION_CONFIG.easing
            )}
            exiting={FadeOut.duration(TRANSITION_CONFIG.duration).easing(
              TRANSITION_CONFIG.easing
            )}
            className="absolute inset-0"
          >
            <Pressable className="flex-1" onPress={onClose} />
          </Animated.View>
        )}

        {/* Bottom sheet */}
        <Animated.View
          entering={SlideInDown.duration(400).springify().damping(20).stiffness(200)}
          exiting={SlideOutDown.duration(TRANSITION_CONFIG.duration).easing(
            TRANSITION_CONFIG.easing
          )}
          layout={Layout.duration(TRANSITION_CONFIG.duration).easing(
            TRANSITION_CONFIG.easing
          )}
          className="rounded-t-3xl bg-surface-100 px-5 pb-10 pt-4"
        >
          {/* Handle */}
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full bg-surface-400" />
          </View>

          {/* Close button */}
          <CloseButton onPress={onClose} />

          {/* Header */}
          <Text className="mb-1 text-center text-2xl font-bold text-white">
            Upgrade Your Trading
          </Text>
          <Text className="mb-6 text-center text-sm text-neutral-400">
            Unlock more traders, higher limits, and premium features
          </Text>

          {/* Feature comparison */}
          <View className="mb-6 rounded-2xl bg-surface-200 p-4">
            {/* Column headers */}
            <View className="mb-3 flex-row items-center">
              <View className="flex-1" />
              <Text className="w-14 text-center text-xs font-semibold text-neutral-500">
                Free
              </Text>
              <Text className="w-14 text-center text-xs font-semibold text-brand-400">
                Pro
              </Text>
              <Text className="w-14 text-center text-xs font-semibold text-warning">
                Elite
              </Text>
            </View>

            {TIER_FEATURES.map((feature, i) => (
              <View
                key={feature.label}
                className={`flex-row items-center py-2.5 ${
                  i < TIER_FEATURES.length - 1
                    ? "border-b border-surface-300"
                    : ""
                }`}
              >
                <Text className="flex-1 text-xs text-neutral-300">
                  {feature.label}
                </Text>
                <FeatureCell value={feature.free} />
                <FeatureCell value={feature.pro} highlight />
                <FeatureCell value={feature.elite} highlight />
              </View>
            ))}
          </View>

          {/* CTA buttons */}
          <View className="gap-3">
            <CTAButton
              tier="pro"
              label="Go Pro"
              price={TIER_PRICING.pro.monthly}
              color="bg-brand-600"
              disabled={currentTier === "pro" || currentTier === "elite"}
              onPress={() => onSelectTier("pro")}
            />
            <CTAButton
              tier="elite"
              label="Go Elite"
              price={TIER_PRICING.elite.monthly}
              color="bg-warning"
              textColor="text-black"
              disabled={currentTier === "elite"}
              onPress={() => onSelectTier("elite")}
            />
          </View>

          <Text className="mt-4 text-center text-xs text-neutral-600">
            Cancel anytime. 7-day free trial included.
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        opacity.value = withTiming(0.5, TRANSITION_CONFIG);
      }}
      onPressOut={() => {
        opacity.value = withTiming(1, TRANSITION_CONFIG);
      }}
      onPress={onPress}
      style={animatedStyle}
      className="absolute right-4 top-4 z-10 h-8 w-8 items-center justify-center rounded-full bg-surface-300"
    >
      <Ionicons name="close" size={18} color="#9ca3af" />
    </AnimatedPressable>
  );
}

function FeatureCell({
  value,
  highlight = false,
}: {
  value: boolean | string;
  highlight?: boolean;
}) {
  if (typeof value === "string") {
    return (
      <Text
        className={`w-14 text-center text-xs font-medium ${
          highlight ? "text-white" : "text-neutral-400"
        }`}
      >
        {value}
      </Text>
    );
  }

  return (
    <View className="w-14 items-center">
      <Ionicons
        name={value ? "checkmark-circle" : "close-circle-outline"}
        size={16}
        color={value ? "#22c55e" : "#3d3d3d"}
      />
    </View>
  );
}

function CTAButton({
  tier,
  label,
  price,
  color,
  textColor = "text-white",
  disabled,
  onPress,
}: {
  tier: string;
  label: string;
  price: string;
  color: string;
  textColor?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withTiming(0.97, TRANSITION_CONFIG);
      }}
      onPressOut={() => {
        scale.value = withTiming(1, TRANSITION_CONFIG);
      }}
      onPress={onPress}
      disabled={disabled}
      style={animatedStyle}
      className={`items-center rounded-2xl px-6 py-4 ${color} ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <Text className={`text-base font-bold ${textColor}`}>{label}</Text>
      <Text className={`mt-0.5 text-xs ${textColor} opacity-70`}>
        {price}/mo
      </Text>
    </AnimatedPressable>
  );
}
