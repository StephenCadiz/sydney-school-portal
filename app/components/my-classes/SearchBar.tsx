"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({
  value,
  onChange,
}: Props) {
  return (
    <div
      style={{
        marginBottom: "25px",
      }}
    >
      <input
        type="text"
        placeholder="Search classes..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "14px 18px",
          fontSize: "16px",
          borderRadius: "10px",
          border: "1px solid #d9d9d9",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}