"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import TeacherLayout from "../../components/layout/TeacherLayout";
import SearchBar from "../../components/my-classes/SearchBar";
import FilterBar from "../../components/my-classes/FilterBar";
import MyClassCard from "../../components/my-classes/MyClassCard";

import { supabase } from "../../../lib/supabase";
import { getTeacherClasses } from "../../../lib/teacher";

type Filter = "all" | "cambridge" | "young-learners";

export default function MyClassesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    async function loadClasses() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      try {
        const teacherClasses = await getTeacherClasses(session.user.id);
        const levelIds = Array.from(
          new Set(
            teacherClasses
              .map((item) => item.level_id)
              .filter(Boolean)
          )
        );

        const { data: levels, error: levelsError } =
          levelIds.length > 0
            ? await supabase
                .from("levels")
                .select("id, name")
                .in("id", levelIds)
            : { data: [], error: null };

        if (levelsError) {
          throw levelsError;
        }

        const classesWithLevels = teacherClasses.map((item) => ({
          ...item,
          levels: (levels || []).find(
            (level) => level.id === item.level_id
          ),
        }));

        setClasses(classesWithLevels);
      } catch (error) {
        console.error("Error loading classes:", error);
      } finally {
        setLoading(false);
      }
    }

    loadClasses();
  }, [router]);

  const filteredClasses = useMemo(() => {
    return classes.filter((item) => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        item.levels?.name?.toLowerCase().includes(searchText) ||
        item.class_name?.toLowerCase().includes(searchText) ||
        item.classrooms?.name?.toLowerCase().includes(searchText) ||
        item.days?.toLowerCase().includes(searchText);

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "cambridge"
          ? item.is_cambridge
          : !item.is_cambridge;

      return matchesSearch && matchesFilter;
    });
  }, [classes, search, filter]);

  const cambridgeCount = classes.filter(
    (item) => item.is_cambridge
  ).length;

  const youngLearnersCount = classes.filter(
    (item) => !item.is_cambridge
  ).length;

  return (
    <TeacherLayout>
      <div className="teacher-my-classes-page">
        <div className="teacher-my-classes-heading">
          <h1>My Classes</h1>

          <p>Manage all of your classes from one place.</p>
        </div>

        <section
          className="teacher-my-classes-toolbar"
          aria-label="Class search and filters"
        >
          <div className="teacher-my-classes-toolbar-controls">
            <SearchBar
              value={search}
              onChange={setSearch}
            />

            <FilterBar
              value={filter}
              onChange={setFilter}
              total={classes.length}
              cambridge={cambridgeCount}
              youngLearners={youngLearnersCount}
            />
          </div>

          <div className="teacher-my-classes-result-count">
            {filteredClasses.length} class
            {filteredClasses.length !== 1 ? "es" : ""} found
          </div>
        </section>

        {loading ? (
          <div className="teacher-my-classes-empty-state">
            Loading classes...
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="teacher-my-classes-empty-state">
            No classes found.
          </div>
        ) : (
          <div className="teacher-my-classes-list">
            {filteredClasses.map((item) => (
              <MyClassCard
                key={item.id}
                item={item}
              />
            ))}
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
