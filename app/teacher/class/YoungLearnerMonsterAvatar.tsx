type YoungLearnerMonsterAvatarProps = {
  learnerId: string;
  size?: number;
  className?: string;
  label?: string;
};

const bodyColours = [
  "#68b5e3",
  "#75c6a1",
  "#f4a261",
  "#ad8bd6",
  "#e989ad",
  "#71c4bc",
  "#e2ad58",
  "#7e9ccf",
];
const accentColours = [
  "#1f5f8c",
  "#24735f",
  "#ad5b21",
  "#6c4a95",
  "#a74369",
  "#217e79",
  "#8d5b15",
  "#425f98",
];

function valuesFromId(learnerId: string) {
  const source = learnerId.replace(/[^a-f0-9]/gi, "").toLowerCase() || "0";
  return Array.from({ length: 12 }, (_, index) =>
    Number.parseInt(source[index % source.length], 16) || 0
  );
}

export default function YoungLearnerMonsterAvatar({
  learnerId,
  size = 72,
  className,
  label,
}: YoungLearnerMonsterAvatarProps) {
  const values = valuesFromId(learnerId);
  const bodyColour = bodyColours[values[0] % bodyColours.length];
  const accentColour = accentColours[values[1] % accentColours.length];
  const eyeCount = values[2] % 3 === 0 ? 1 : values[2] % 3 === 1 ? 2 : 3;
  const bodyShape = values[3] % 3;
  const feature = values[4] % 3;
  const mouth = values[5] % 3;
  const marking = values[6] % 3;
  const eyeXs = eyeCount === 1 ? [50] : eyeCount === 2 ? [40, 60] : [33, 50, 67];
  const body =
    bodyShape === 0 ? (
      <circle cx="50" cy="54" fill={bodyColour} r="34" />
    ) : bodyShape === 1 ? (
      <rect x="18" y="20" width="64" height="68" rx="27" fill={bodyColour} />
    ) : (
      <path d="M20 81V45C20 25 34 16 50 16s30 9 30 29v36c-8 7-19 11-30 11S28 88 20 81Z" fill={bodyColour} />
    );

  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label ? `${label} monster avatar` : undefined}
      className={className}
      height={size}
      role={label ? "img" : undefined}
      viewBox="0 0 100 100"
      width={size}
    >
      {feature === 0 && (
        <>
          <path d="M28 28 21 10l18 14" fill={accentColour} stroke={accentColour} strokeLinejoin="round" strokeWidth="6" />
          <path d="m72 28 7-18-18 14" fill={accentColour} stroke={accentColour} strokeLinejoin="round" strokeWidth="6" />
        </>
      )}
      {feature === 1 && (
        <>
          <path d="M27 32C15 25 13 13 20 9c9 2 14 10 16 20" fill={accentColour} />
          <path d="M73 32c12-7 14-19 7-23-9 2-14 10-16 20" fill={accentColour} />
        </>
      )}
      {feature === 2 && (
        <>
          <path d="M33 27 27 9l15 15" fill="#fff8e7" stroke={accentColour} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          <path d="m67 27 6-18-15 15" fill="#fff8e7" stroke={accentColour} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        </>
      )}
      {body}
      {marking === 0 && <circle cx="31" cy="61" fill="#ffffff" fillOpacity="0.3" r="7" />}
      {marking === 1 && <path d="M29 63c12-8 30-8 42 0" fill="none" stroke="#ffffff" strokeLinecap="round" strokeOpacity="0.35" strokeWidth="6" />}
      {marking === 2 && <path d="M30 52h40M30 63h40" stroke="#ffffff" strokeLinecap="round" strokeOpacity="0.3" strokeWidth="4" />}
      {eyeXs.map((x, index) => (
        <g key={`${x}-${index}`}>
          <circle cx={x} cy="46" fill="#ffffff" r={eyeCount === 3 ? 9 : 11} />
          <circle cx={x + (values[7 + index] % 3) - 1} cy="47" fill="#243044" r={eyeCount === 3 ? 3.5 : 4.5} />
          <circle cx={x + (values[7 + index] % 3)} cy="45.5" fill="#ffffff" r="1.2" />
        </g>
      ))}
      {mouth === 0 && <path d="M38 66c7 8 17 8 24 0" fill="none" stroke="#243044" strokeLinecap="round" strokeWidth="4" />}
      {mouth === 1 && <path d="M39 70c6-5 16-5 22 0" fill="none" stroke="#243044" strokeLinecap="round" strokeWidth="4" />}
      {mouth === 2 && <path d="M42 67h16" stroke="#243044" strokeLinecap="round" strokeWidth="4" />}
    </svg>
  );
}
