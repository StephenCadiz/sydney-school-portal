"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";
import ClassPointsEntryDialog from "./ClassPointsEntryDialog";
import YoungLearnerMonsterAvatar from "./YoungLearnerMonsterAvatar";

export type ClassPointsHistoryEntry = {
  id: string;
  homework_done: boolean | null;
  speaking_english: boolean | null;
  good_behaviour: boolean | null;
  exam_mark: number | null;
  points_delta: number;
  created_at: string;
  teacher_name: string;
};

export type ClassPointsLearner = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  points_total: number;
  rank: number;
  history: ClassPointsHistoryEntry[];
};

export type ClassPointsSnapshot = {
  class: { id: string; name: string };
  academic_year: string;
  learners: ClassPointsLearner[];
};

type ClassPointsTabProps = {
  classId: string;
};

function formatPoints(points: number) {
  return points > 0 ? `+${points}` : String(points);
}

export default function ClassPointsTab({ classId }: ClassPointsTabProps) {
  const [snapshot, setSnapshot] = useState<ClassPointsSnapshot | null>(null);
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadClassPoints = useCallback(async () => {
    setLoading(true);
    setError("");

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

      setSnapshot(payload as ClassPointsSnapshot);
    } catch (loadError) {
      console.error("Unable to load Class Points:", loadError);
      setSnapshot(null);
      setError("Unable to load Class Points.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void loadClassPoints();
  }, [loadClassPoints]);

  const selectedLearner = snapshot?.learners.find(
    (learner) => learner.id === selectedLearnerId
  );

  return (
    <section className="class-points-tab" aria-labelledby="class-points-heading">
      <header className="class-points-tab-header">
        <div>
          <p>Young Learner motivation</p>
          <h2 id="class-points-heading">Class Points</h2>
          <span>
            Encourage everyday effort with informal points for this class.
          </span>
        </div>
        <div className="class-points-header-actions">
          {snapshot && (
            <div className="class-points-academic-year">
              <span>Academic year</span>
              <strong>{snapshot.academic_year}</strong>
            </div>
          )}
          <a
            className="class-points-display-link"
            href={`/teacher/class-points-display?classId=${encodeURIComponent(
              classId
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Display Results
          </a>
        </div>
      </header>

      {loading ? (
        <p className="class-points-state">Loading Class Points...</p>
      ) : error ? (
        <div className="class-points-state is-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadClassPoints()}>
            Try again
          </button>
        </div>
      ) : !snapshot?.learners.length ? (
        <p className="class-points-state">
          No learners are currently enrolled in this class.
        </p>
      ) : (
        <div className="class-points-learner-grid" aria-label="Class Points learners">
          {snapshot.learners.map((learner) => {
            const isLeader = learner.rank === 1;

            return (
              <button
                key={learner.id}
                type="button"
                className={`class-points-learner-card ${
                  isLeader ? "is-leader" : ""
                }`}
                onClick={() => setSelectedLearnerId(learner.id)}
              >
                <span className="class-points-rank" aria-label={`Rank ${learner.rank}`}>
                  {isLeader ? "Leader" : `#${learner.rank}`}
                </span>
                <YoungLearnerMonsterAvatar
                  learnerId={learner.id}
                  size={86}
                  className="class-points-monster-avatar"
                  label={learner.display_name}
                />
                <span className="class-points-learner-name">
                  {learner.display_name}
                </span>
                <span className="class-points-total">
                  <strong>{formatPoints(learner.points_total)}</strong>
                  <small>points</small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {snapshot && selectedLearner && (
        <ClassPointsEntryDialog
          academicYear={snapshot.academic_year}
          classId={classId}
          learner={selectedLearner}
          onClose={() => setSelectedLearnerId(null)}
          onSnapshotUpdate={setSnapshot}
        />
      )}
    </section>
  );
}
