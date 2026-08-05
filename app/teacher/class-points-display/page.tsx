"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { supabase } from "../../../lib/supabase";
import YoungLearnerMonsterAvatar from "../class/YoungLearnerMonsterAvatar";
import type { ClassPointsSnapshot } from "../class/ClassPointsTab";
import styles from "./ClassPointsDisplay.module.css";

type InitialLoadState = "loading" | "ready" | "error";

function formatPoints(points: number) {
  return points > 0 ? `+${points}` : String(points);
}

function ClassPointsDisplayContent() {
  const searchParams = useSearchParams();
  const classId = String(searchParams.get("classId") || "").trim();
  const [snapshot, setSnapshot] = useState<ClassPointsSnapshot | null>(null);
  const [initialLoadState, setInitialLoadState] =
    useState<InitialLoadState>("loading");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const requestInProgressRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshLeaderboard = useCallback(async () => {
    if (!classId || requestInProgressRef.current) return;

    requestInProgressRef.current = true;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Authentication required.");

      const response = await fetch(
        `/api/teacher/classes/${encodeURIComponent(classId)}/class-points`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Unable to load Class Points.");
      }

      if (!mountedRef.current) return;
      hasLoadedRef.current = true;
      setSnapshot(payload as ClassPointsSnapshot);
      setInitialLoadState("ready");
      setRefreshFailed(false);
    } catch (error) {
      console.error("Unable to refresh Class Points display:", error);
      if (!mountedRef.current) return;

      if (hasLoadedRef.current) {
        setRefreshFailed(true);
      } else {
        setInitialLoadState("error");
      }
    } finally {
      requestInProgressRef.current = false;
    }
  }, [classId]);

  useEffect(() => {
    mountedRef.current = true;
    hasLoadedRef.current = false;
    requestInProgressRef.current = false;
    setSnapshot(null);
    setRefreshFailed(false);

    if (!classId) {
      setInitialLoadState("error");
      return () => {
        mountedRef.current = false;
      };
    }

    setInitialLoadState("loading");
    void refreshLeaderboard();
    const interval = window.setInterval(() => {
      void refreshLeaderboard();
    }, 5000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [classId, refreshLeaderboard]);

  if (initialLoadState === "loading" && !snapshot) {
    return (
      <div className={styles.page}>
        <main className={styles.state} aria-live="polite">
          <p>Loading Class Points...</p>
        </main>
      </div>
    );
  }

  if (initialLoadState === "error" && !snapshot) {
    return (
      <div className={styles.page}>
        <main className={`${styles.state} ${styles.error}`} role="alert">
          <p>Unable to load Class Points.</p>
        </main>
      </div>
    );
  }

  if (!snapshot) return null;

  const learnerCount = snapshot.learners.length;
  const boardClasses = [
    styles.grid,
    learnerCount <= 6 ? styles.smallRoster : "",
    learnerCount >= 13 ? styles.largeRoster : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.page}>
      <main className={styles.content} aria-labelledby="class-points-display-heading">
        <header className={styles.header}>
          <div className={styles.heading}>
            <h1 id="class-points-display-heading">
              {snapshot.class.name} Class Points
            </h1>
            <p>
              Academic year <strong>{snapshot.academic_year}</strong>
            </p>
          </div>
          <p className={styles.liveStatus} aria-live="polite">
            <span aria-hidden="true" />
            {refreshFailed ? "Live · Reconnecting" : "Live · Updated automatically"}
          </p>
        </header>

        {learnerCount === 0 ? (
          <p className={styles.empty}>
            No learners are currently enrolled in this class.
          </p>
        ) : (
          <section className={boardClasses} aria-labelledby="class-points-board-heading">
            <h2 id="class-points-board-heading" className={styles.srOnly}>
              Class Points leaderboard
            </h2>
            {snapshot.learners.map((learner) => {
              const isLeader = learner.rank === 1 && learner.points_total > 0;

              return (
                <article
                  key={learner.id}
                  className={`${styles.card} ${isLeader ? styles.leader : ""}`}
                >
                  <span className={`${styles.rank} ${isLeader ? styles.leaderRank : ""}`}>
                    {isLeader ? `Leader · Rank ${learner.rank}` : `Rank ${learner.rank}`}
                  </span>
                  <YoungLearnerMonsterAvatar
                    learnerId={learner.id}
                    size={220}
                    className={styles.avatar}
                  />
                  <h3>{learner.display_name}</h3>
                  <div className={styles.total}>
                    <strong>{formatPoints(learner.points_total)}</strong>
                    <span>points</span>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}

export default function ClassPointsDisplayPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <main className={styles.state} aria-live="polite">
            <p>Loading Class Points...</p>
          </main>
        </div>
      }
    >
      <ClassPointsDisplayContent />
    </Suspense>
  );
}
