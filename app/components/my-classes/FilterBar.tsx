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
  const buttonStyle = (active: boolean) => ({
    background: active ? "#1f3c88" : "#f3f4f6",
    color: active ? "#ffffff" : "#444",
    border: "none",
    borderRadius: "8px",
    padding: "10px 18px",
    cursor: "pointer",
    fontWeight: 600,
    transition: "0.2s",
  });

  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        marginBottom: "25px",
        flexWrap: "wrap",
      }}
    >
      <button
        style={buttonStyle(value === "all")}
        onClick={() => onChange("all")}
      >
        All ({total})
      </button>

      <button
        style={buttonStyle(value === "cambridge")}
        onClick={() => onChange("cambridge")}
      >
        Cambridge ({cambridge})
      </button>

      <button
        style={buttonStyle(value === "young-learners")}
        onClick={() => onChange("young-learners")}
      >
        Young Learners ({youngLearners})
      </button>
    </div>
  );
}