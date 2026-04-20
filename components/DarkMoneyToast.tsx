import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Rect, Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'update' | 'transfer' | 'delete'

export interface ToastConfig {
  type: ToastType
  title: string
  subtitle?: string
  amount?: string
  duration?: number
  onUndo?: () => void
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const THEME: Record<ToastType, {
  bg: string
  iconBg: string
  accent: string
  subtitleColor: string
  undoBorder: string
}> = {
  success:  { bg: '#0A1E14', iconBg: '#112B1C', accent: '#2CC787', subtitleColor: '#6AAF90', undoBorder: 'rgba(44,199,135,0.35)' },
  update:   { bg: '#1C1700', iconBg: '#302700', accent: '#E8C44A', subtitleColor: '#A08830', undoBorder: 'rgba(232,196,74,0.35)' },
  transfer: { bg: '#130E28', iconBg: '#1E1440', accent: '#9B7AE8', subtitleColor: '#6A5090', undoBorder: 'rgba(155,122,232,0.35)' },
  delete:   { bg: '#200A0A', iconBg: '#381212', accent: '#E85A5A', subtitleColor: '#A04040', undoBorder: 'rgba(232,90,90,0.35)' },
}

// ─── Dimensions ───────────────────────────────────────────────────────────────

const TOAST_W = 320
const TOAST_H = 64
const RADIUS  = 18
const PERIM   =
  2 * (TOAST_W - 2 * RADIUS) +
  2 * (TOAST_H - 2 * RADIUS) +
  2 * Math.PI * RADIUS

// ─── Icons ────────────────────────────────────────────────────────────────────

function ToastIcon({ type, color }: { type: ToastType; color: string }) {
  const p = { stroke: color, strokeWidth: 1.5, fill: 'none' as const }
  switch (type) {
    case 'success':
      return (
        <Svg width={16} height={16} viewBox="0 0 16 16">
          <Rect x={1} y={1} width={14} height={14} rx={7} {...p} />
          <Path d="M5 8.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" {...p} />
        </Svg>
      )
    case 'update':
      return (
        <Svg width={16} height={16} viewBox="0 0 16 16">
          <Path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z" strokeLinejoin="round" {...p} />
          <Path d="M9 4.5l2.5 2.5" strokeLinecap="round" {...p} />
        </Svg>
      )
    case 'transfer':
      return (
        <Svg width={16} height={16} viewBox="0 0 16 16">
          <Path
            d="M3 5h10M10 2l3 3-3 3M13 11H3M6 8l-3 3 3 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...p}
          />
        </Svg>
      )
    case 'delete':
      return (
        <Svg width={16} height={16} viewBox="0 0 16 16">
          <Path d="M3 5h10l-1 8H4L3 5z" strokeLinejoin="round" {...p} />
          <Path
            d="M6 5V3.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V5M1.5 5h13"
            strokeLinecap="round"
            {...p}
          />
        </Svg>
      )
  }
}

// ─── Border progress ──────────────────────────────────────────────────────────

const AnimatedRect = Animated.createAnimatedComponent(Rect)

function BorderProgress({ progress, color }: { progress: Animated.Value; color: string }) {
  const dashOffset = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, PERIM],
  })

  return (
    <Svg
      width={TOAST_W}
      height={TOAST_H}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Rect
        x={1} y={1}
        width={TOAST_W - 2} height={TOAST_H - 2}
        rx={RADIUS - 1}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.15}
      />
      <AnimatedRect
        x={1} y={1}
        width={TOAST_W - 2} height={TOAST_H - 2}
        rx={RADIUS - 1}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray={PERIM}
        strokeDashoffset={dashOffset}
      />
    </Svg>
  )
}

// ─── Toast component ──────────────────────────────────────────────────────────

interface ToastProps {
  config: ToastConfig | null
  onHide: () => void
}

export function DarkMoneyToast({ config, onHide }: ToastProps) {
  const insets        = useSafeAreaInsets()
  const opacity       = useRef(new Animated.Value(0)).current
  const translateY    = useRef(new Animated.Value(20)).current
  const scale         = useRef(new Animated.Value(0.96)).current
  const dragY         = useRef(new Animated.Value(0)).current
  const progress      = useRef(new Animated.Value(0)).current
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissingRef = useRef(false)

  const runHide = useCallback(() => {
    if (dismissingRef.current) return
    dismissingRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 0,    duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 30,   duration: 200, useNativeDriver: true }),
      Animated.timing(scale,      { toValue: 0.94, duration: 200, useNativeDriver: true }),
      Animated.timing(dragY,      { toValue: 0,    duration: 200, useNativeDriver: true }),
    ]).start(() => { dismissingRef.current = false; onHide() })
  }, [opacity, translateY, scale, dragY, onHide])

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, gs) =>
      gs.dy > 6 && Math.abs(gs.dy) > Math.abs(gs.dx),
    onPanResponderMove: (_e, gs) => {
      dragY.setValue(Math.max(0, gs.dy))
    },
    onPanResponderRelease: (_e, gs) => {
      if (gs.dy > 40 || gs.vy > 0.6) {
        runHide()
      } else {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start()
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start()
    },
  }), [dragY, runHide])

  const handleUndo = useCallback(() => {
    config?.onUndo?.()
    runHide()
  }, [config, runHide])

  useEffect(() => {
    if (!config) return

    dismissingRef.current = false
    opacity.setValue(0)
    translateY.setValue(20)
    scale.setValue(0.96)
    dragY.setValue(0)
    progress.setValue(0)

    const dur = config.duration ?? 3500

    Animated.parallel([
      Animated.spring(opacity,    { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 10 }),
      Animated.spring(scale,      { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
    ]).start()

    Animated.timing(progress, {
      toValue: 1,
      duration: dur,
      useNativeDriver: false,
    }).start()

    timerRef.current = setTimeout(runHide, dur)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [config]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) return null

  const theme = THEME[config.type]

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.toast,
        {
          backgroundColor: theme.bg,
          bottom: insets.bottom + 24,
          opacity,
          transform: [{ translateY: Animated.add(translateY, dragY) }, { scale }],
        },
      ]}
    >
      <BorderProgress progress={progress} color={theme.accent} />

      <View style={[styles.iconBox, { backgroundColor: theme.iconBg }]}>
        <ToastIcon type={config.type} color={theme.accent} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.accent }]} numberOfLines={1}>
          {config.title}
        </Text>
        {config.subtitle ? (
          <Text style={[styles.subtitle, { color: theme.subtitleColor }]} numberOfLines={1}>
            {config.subtitle}
          </Text>
        ) : null}
      </View>

      {config.onUndo ? (
        <Pressable
          onPress={handleUndo}
          style={({ pressed }) => [
            styles.undoBtn,
            { borderColor: theme.undoBorder, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.undoText, { color: theme.accent }]}>Deshacer</Text>
        </Pressable>
      ) : config.amount ? (
        <Text style={[styles.amount, { color: theme.accent }]}>
          {config.amount}
        </Text>
      ) : null}
    </Animated.View>
  )
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ToastContextValue {
  show: (config: ToastConfig) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ToastConfig | null>(null)

  const show = useCallback((cfg: ToastConfig) => {
    setConfig(null)
    requestAnimationFrame(() => setConfig(cfg))
  }, [])

  const hide = useCallback(() => setConfig(null), [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <DarkMoneyToast config={config} onHide={hide} />
    </ToastContext.Provider>
  )
}

export function useDarkMoneyToast() {
  return useContext(ToastContext)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    width: TOAST_W,
    height: TOAST_H,
    borderRadius: RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 20,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body:     { flex: 1 },
  title:    { fontSize: 12, fontWeight: '700', letterSpacing: 0.1 },
  subtitle: { fontSize: 10, marginTop: 2, opacity: 0.85 },
  amount:   { fontSize: 13, fontWeight: '700', letterSpacing: -0.2, flexShrink: 0 },
  undoBtn: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  undoText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
})
