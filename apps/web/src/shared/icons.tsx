import type { ReactNode } from "react";

type IconProps = { weight?: "regular" | "bold" | "fill" | string };

type IconComponent = (props: IconProps) => ReactNode;

function icon(content: ReactNode): IconComponent {
  return ({ weight = "regular" }) => (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight === "bold" ? 2.4 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {content}
    </svg>
  );
}

export const ArrowUpRightIcon = icon(<path d="M7 17 17 7M8 7h9v9" />);

export const ChatCircleDotsIcon = icon(
  <>
    <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.4-.75L4 20l1.5-4.4A7.5 7.5 0 1 1 20 11.5Z" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth="2.6" />
  </>,
);

export const FireIcon = icon(
  <path d="M12 22c4.1 0 7-2.7 7-6.7 0-2.8-1.4-5-4.2-7.8-.1 2-1 3.3-2.1 4.1C12.4 7.8 10.7 4.8 7.5 2 8 6.6 4 9.6 4 15.1 4 19.2 7.1 22 12 22Z" />,
);

export const ForkKnifeIcon = icon(
  <>
    <path d="M7 3v6M4.5 3v4.5A2.5 2.5 0 0 0 7 10a2.5 2.5 0 0 0 2.5-2.5V3M7 10v11" />
    <path d="M16 3v18M16 3c2.3 2.2 3.5 5.2 3.5 8.5H16" />
  </>,
);

export const PaperPlaneTiltIcon = icon(
  <path d="m3 11 18-8-8 18-2.8-7.2L3 11Zm7.2 2.8L21 3" />,
);

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);

export const TrashIcon = icon(
  <>
    <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 14h11l1-14M9 7V4h6v3" />
  </>,
);

export const PencilIcon = icon(
  <path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5ZM14.5 6l3.5 3.5" />,
);

export const RepeatIcon = icon(
  <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
);

export const UndoIcon = icon(<path d="M9 14 4 9l5-5M4 9h9a7 7 0 0 1 0 14h-2" />);
export const DownloadIcon = icon(<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v4h16v-4" />);
export const UploadIcon = icon(<path d="M12 16V4m0 0L8 8m4-4 4 4M4 17v4h16v-4" />);

export const BreakfastIcon = icon(
  <path d="M3 13h18a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7ZM5 9h14M7 5h10" />,
);

export const LunchIcon = ForkKnifeIcon;

export const DinnerIcon = icon(
  <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
);

export const SnackIcon = icon(<path d="M12 3v18M3 12h18" />);

export const WaistIcon = icon(
  <path d="M5 5h14v14H5zM8 5v4m4-4v2m4-2v4M8 19v-4m4 4v-2m4 2v-4" />,
);

export const ScaleIcon = icon(
  <path d="M12 3v18M5 7h14M7 7l-4 8h8L7 7Zm10 0-4 8h8l-4-8ZM8 21h8" />,
);
