import {
  withTiming,
  withSpring,
  Easing,
  SharedTransition,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  type AnimationCallback,
} from "react-native-reanimated";
import { useCallback } from "react";

export const TRANSITION_DURATION = 250;

export const TRANSITION_EASING = Easing.bezier(0.19, 1, 0.22, 1);

const timingConfig = {
  duration: TRANSITION_DURATION,
  easing: TRANSITION_EASING,
};

export function slideFromRight(values: EntryAnimationsValues) {
  "worklet";
  return {
    initialValues: {
      originX: values.targetOriginX + values.targetWidth,
      opacity: 0,
    },
    animations: {
      originX: withTiming(values.targetOriginX, timingConfig),
      opacity: withTiming(1, timingConfig),
    },
  };
}

export function slideFromRightExit(values: ExitAnimationsValues) {
  "worklet";
  return {
    initialValues: {
      originX: values.currentOriginX,
      opacity: 1,
    },
    animations: {
      originX: withTiming(
        values.currentOriginX - values.currentWidth * 0.3,
        timingConfig
      ),
      opacity: withTiming(0.5, timingConfig),
    },
  };
}

export function slideFromBottom(values: EntryAnimationsValues) {
  "worklet";
  return {
    initialValues: {
      originY: values.targetOriginY + values.targetHeight,
      opacity: 0,
    },
    animations: {
      originY: withTiming(values.targetOriginY, timingConfig),
      opacity: withTiming(1, timingConfig),
    },
  };
}

export function slideFromBottomExit(values: ExitAnimationsValues) {
  "worklet";
  return {
    initialValues: {
      originY: values.currentOriginY,
      opacity: 1,
    },
    animations: {
      originY: withTiming(
        values.currentOriginY + values.currentHeight,
        timingConfig
      ),
      opacity: withTiming(0, timingConfig),
    },
  };
}

export function fadeIn(values: EntryAnimationsValues) {
  "worklet";
  return {
    initialValues: {
      opacity: 0,
    },
    animations: {
      opacity: withTiming(1, timingConfig),
    },
  };
}

export function fadeOut(values: ExitAnimationsValues) {
  "worklet";
  return {
    initialValues: {
      opacity: 1,
    },
    animations: {
      opacity: withTiming(0, timingConfig),
    },
  };
}

export function scaleUp(values: EntryAnimationsValues) {
  "worklet";
  return {
    initialValues: {
      transform: [{ scale: 0.9 }],
      opacity: 0,
    },
    animations: {
      transform: [{ scale: withSpring(1, { damping: 20, stiffness: 300 }) }],
      opacity: withTiming(1, timingConfig),
    },
  };
}

export function scaleDown(values: ExitAnimationsValues) {
  "worklet";
  return {
    initialValues: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    animations: {
      transform: [{ scale: withTiming(0.9, timingConfig) }],
      opacity: withTiming(0, timingConfig),
    },
  };
}

export const sharedTransitionConfig = SharedTransition.custom((values) => {
  "worklet";
  return {
    originX: withTiming(values.targetOriginX, timingConfig),
    originY: withTiming(values.targetOriginY, timingConfig),
    width: withTiming(values.targetWidth, timingConfig),
    height: withTiming(values.targetHeight, timingConfig),
  };
});

type TransitionVariant = "slideRight" | "slideBottom" | "fade" | "scale";

const enteringMap = {
  slideRight: slideFromRight,
  slideBottom: slideFromBottom,
  fade: fadeIn,
  scale: scaleUp,
} as const;

const exitingMap = {
  slideRight: slideFromRightExit,
  slideBottom: slideFromBottomExit,
  fade: fadeOut,
  scale: scaleDown,
} as const;

export function useViewTransition(variant: TransitionVariant = "slideRight") {
  const entering = useCallback(() => enteringMap[variant], [variant]);
  const exiting = useCallback(() => exitingMap[variant], [variant]);

  return {
    entering: enteringMap[variant],
    exiting: exitingMap[variant],
  };
}
