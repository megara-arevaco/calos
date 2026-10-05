type IconProps = { weight?: string; fill?: string };

const glyph =
  (mark: string) =>
  ({ weight: _weight }: IconProps) => <span aria-hidden="true">{mark}</span>;

export const ArrowUpRightIcon = glyph("↗");
export const ChatCircleDotsIcon = glyph("◌");
export const FireIcon = glyph("♨");
export const ForkKnifeIcon = glyph("⌘");
export const PaperPlaneTiltIcon = glyph("↑");
export const PlusIcon = glyph("+");
export const TrashIcon = glyph("×");
