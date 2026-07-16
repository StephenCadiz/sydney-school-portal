type Filter = "all" | "cambridge" | "young-learners";

type Props = {
  value: Filter;
  onChange: (value: Filter) => void;
  total?: number;
  cambridge?: number;
  youngLearners?: number;
};

export default function FilterBar({
  value,
  onChange,
  total = 0,
  cambridge = 0,
  youngLearners = 0,
}: Props) {
  return (
    <div className="teacher-my-classes-filters" aria-label="Filter classes">
      <button
        type="button"
        className={`teacher-my-classes-filter-button ${
          value === "all" ? "is-active" : ""
        }`}
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        All ({total})
      </button>

      <button
        type="button"
        className={`teacher-my-classes-filter-button ${
          value === "cambridge" ? "is-active" : ""
        }`}
        aria-pressed={value === "cambridge"}
        onClick={() => onChange("cambridge")}
      >
        Cambridge ({cambridge})
      </button>

      <button
        type="button"
        className={`teacher-my-classes-filter-button ${
          value === "young-learners" ? "is-active" : ""
        }`}
        aria-pressed={value === "young-learners"}
        onClick={() => onChange("young-learners")}
      >
        Young Learners ({youngLearners})
      </button>
    </div>
  );
}
