"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent
} from "react";

import styles from "./PublicMatchdayNavigation.module.css";

type MatchdayNavigationItem = {
  id: string;
  href: string;
  label: string;
  isActive: boolean;
};

type MotionState = {
  fromX: number;
  toX: number;
  direction: "left" | "right";
  durationMs: number;
  trailScale: number;
  shouldAnimate: boolean;
};

type PublicMatchdayNavigationProps = {
  ariaLabel?: string;
  className?: string;
  items: MatchdayNavigationItem[];
  storageKey: string;
};

type Phase = "hidden" | "ready" | "running" | "settled";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function findActiveIndex(items: MatchdayNavigationItem[]) {
  const activeIndex = items.findIndex((item) => item.isActive);
  return activeIndex >= 0 ? activeIndex : 0;
}

export default function PublicMatchdayNavigation({
  ariaLabel = "Jornadas",
  className,
  items,
  storageKey
}: PublicMatchdayNavigationProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const timerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("hidden");
  const [motion, setMotion] = useState<MotionState | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const currentId = useMemo(
    () => items.find((item) => item.isActive)?.id ?? items[0]?.id ?? null,
    [items]
  );
  const visualActiveId = pendingId ?? currentId;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const nav = navRef.current;

    if (!items.length || !wrapper || !nav || !currentId) {
      setPhase("hidden");
      setMotion(null);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const applyLayout = () => {
      const activeIndex = findActiveIndex(items);
      const activeItem = items[activeIndex] ?? null;
      const activeElement = itemRefs.current[activeIndex];

      if (!activeItem || !activeElement) {
        return;
      }

      const maximumScroll = Math.max(nav.scrollWidth - nav.clientWidth, 0);
      const desiredScroll = activeElement.offsetLeft + activeElement.offsetWidth / 2 - nav.clientWidth / 2;
      nav.scrollLeft = clamp(desiredScroll, 0, maximumScroll);

      const minimumX = 38;
      const maximumX = Math.max(wrapper.clientWidth - 38, minimumX);
      const navOffsetX = nav.offsetLeft;
      const positions = items.map((_, index) => {
        const element = itemRefs.current[index];

        if (!element) {
          return minimumX;
        }

        return clamp(
          navOffsetX + element.offsetLeft - nav.scrollLeft + element.offsetWidth / 2,
          minimumX,
          maximumX
        );
      });

      const storedId = window.sessionStorage.getItem(storageKey);
      const storedIndex = storedId ? items.findIndex((item) => item.id === storedId) : activeIndex;
      const previousIndex = storedIndex >= 0 ? storedIndex : activeIndex;
      const fromX = positions[previousIndex] ?? positions[activeIndex] ?? minimumX;
      const toX = positions[activeIndex] ?? fromX;
      const jump = Math.abs(activeIndex - previousIndex);
      const shouldAnimate = !mediaQuery.matches && jump > 0;
      const nextMotion: MotionState = {
        fromX,
        toX,
        direction: toX >= fromX ? "right" : "left",
        durationMs: clamp(520 + jump * 175, 520, 1750),
        trailScale: clamp(0.7 + jump * 0.2, 0.7, 1.7),
        shouldAnimate
      };

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setMotion(nextMotion);
      setPhase(shouldAnimate ? "ready" : "settled");
      window.sessionStorage.setItem(storageKey, activeItem.id);

      if (!shouldAnimate) {
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setPhase("running");
        });
      });

      timerRef.current = window.setTimeout(() => {
        setPhase("settled");
        timerRef.current = null;
      }, nextMotion.durationMs + 120);
    };

    applyLayout();
    window.addEventListener("resize", applyLayout);

    return () => {
      window.removeEventListener("resize", applyLayout);

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentId, items, storageKey]);

  useEffect(() => {
    return () => {
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
        navigationTimerRef.current = null;
      }
    };
  }, []);

  const handleMatchdayClick = (
    event: MouseEvent<HTMLAnchorElement>,
    item: MatchdayNavigationItem,
    targetIndex: number
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    if (navigationTimerRef.current !== null || item.id === visualActiveId) {
      return;
    }

    const wrapper = wrapperRef.current;
    const nav = navRef.current;
    const targetElement = itemRefs.current[targetIndex];

    if (!wrapper || !nav || !targetElement) {
      window.location.assign(item.href);
      return;
    }

    const minimumX = 38;
    const maximumX = Math.max(wrapper.clientWidth - 38, minimumX);
    const navOffsetX = nav.offsetLeft;
    const itemPosition = (index: number) => {
      const element = itemRefs.current[index];

      if (!element) {
        return minimumX;
      }

      return clamp(
        navOffsetX + element.offsetLeft - nav.scrollLeft + element.offsetWidth / 2,
        minimumX,
        maximumX
      );
    };

    const currentIndex = Math.max(
      items.findIndex((candidate) => candidate.id === visualActiveId),
      0
    );
    const fromX = motion?.toX ?? itemPosition(currentIndex);
    const toX = itemPosition(targetIndex);
    const jump = Math.abs(targetIndex - currentIndex);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const shouldAnimate = !reducedMotion && jump > 0;
    const nextMotion: MotionState = {
      fromX,
      toX,
      direction: toX >= fromX ? "right" : "left",
      durationMs: clamp(520 + jump * 175, 520, 1750),
      trailScale: clamp(0.7 + jump * 0.2, 0.7, 1.7),
      shouldAnimate
    };

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setPendingId(item.id);
    setMotion(nextMotion);
    setPhase(shouldAnimate ? "ready" : "settled");
    window.sessionStorage.setItem(storageKey, item.id);

    if (shouldAnimate) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setPhase("running");
        });
      });
    }

    navigationTimerRef.current = window.setTimeout(() => {
      navigationTimerRef.current = null;
      window.location.assign(item.href);
    }, 180);
  };

  const style = motion
    ? ({
        "--journey-from-x": `${motion.fromX}px`,
        "--journey-to-x": `${motion.toX}px`,
        "--journey-duration": `${motion.durationMs}ms`,
        "--journey-trail-scale": `${motion.trailScale}`
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={styles.wrapper}
      data-direction={motion?.direction ?? "right"}
      data-phase={phase}
      data-running={motion?.shouldAnimate ? "true" : "false"}
      data-pending={pendingId ? "true" : "false"}
      ref={wrapperRef}
      style={style}
    >
      <div className={styles.lane} aria-hidden="true">
        <span className={styles.destination} />
        <span className={styles.runnerShell}>
          <span className={styles.trail}>
            <span className={styles.trailBurst} />
            <span className={styles.trailLineOne} />
            <span className={styles.trailLineTwo} />
          </span>
          <svg
            className={styles.runner}
            focusable="false"
            role="presentation"
            viewBox="0 0 124 74"
            xmlns="http://www.w3.org/2000/svg"
          >
            <ellipse className={styles.shadow} cx="63" cy="69" rx="28" ry="4" />
            <g className={styles.sprite}>
              <g className={styles.backArm}>
                <path d="M47 34c-8 1-15 7-18 15" />
                <circle cx="28" cy="50" r="3.4" />
              </g>
              <g className={styles.frontArm}>
                <path d="M72 35c7 4 13 10 16 17" />
                <circle cx="90" cy="54" r="3.4" />
              </g>
              <g className={styles.backLeg}>
                <path d="M57 54c-6 8-10 13-16 15" />
                <path d="M41 69h14" />
              </g>
              <g className={styles.frontLeg}>
                <path d="M68 54c4 8 10 12 19 14" />
                <path d="M87 68h13" />
              </g>

              <path className={styles.shorts} d="M53 46h22l-1 11-12 2-11-3Z" />
              <path className={styles.shirt} d="M46 27c6-5 12-7 18-7 7 0 13 2 19 8l-6 20H53Z" />
              <path className={styles.collar} d="M59 24c2 4 7 4 10 0" />
              <path className={styles.tieKnot} d="M60 27h7l2 4-5 4-6-4Z" />
              <path className={styles.tie} d="m63 34 6 11-6 5-6-5 5-11Z" />

              <circle className={styles.ear} cx="48" cy="18" r="4" />
              <circle className={styles.ear} cx="78" cy="18" r="4" />
              <circle className={styles.face} cx="63" cy="18" r="17" />
              <path
                className={styles.hair}
                d="M47 15c0-9 7-15 16-15 9 0 16 5 18 15-6-5-11-6-14-4l-4-5-4 5-7-2-1 6Z"
              />
              <circle className={styles.eye} cx="57" cy="18" r="1.7" />
              <circle className={styles.eye} cx="69" cy="18" r="1.7" />
              <path className={styles.smile} d="M58 25c3 3 8 3 11 0" />
            </g>
            <g className={styles.ball}>
              <circle cx="108" cy="58" r="10" />
              <path d="m108 52 4 3-1 5h-6l-1-5Z" />
              <path d="m101 54 4 2m7-1 4-1m-7 7 4 4m-9-3-4 4" />
            </g>
          </svg>
        </span>
      </div>
      <nav
        aria-busy={pendingId ? "true" : undefined}
        aria-label={ariaLabel}
        className={["public-matchday-nav", className].filter(Boolean).join(" ")}
        ref={navRef}
      >
        {items.map((item, index) => {
          const isVisualActive = item.id === visualActiveId;

          return (
            <a
              aria-current={isVisualActive ? "page" : undefined}
              data-active={isVisualActive ? "true" : undefined}
              href={item.href}
              key={item.id}
              onClick={(event) => handleMatchdayClick(event, item, index)}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
